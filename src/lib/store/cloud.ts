/**
 * Store driver — Vercel-native storage (production serverless).
 *
 * Vercel functions run on a read-only filesystem with an ephemeral, per-instance
 * /tmp, so the file-backed driver cannot durably persist sessions or photos across
 * requests. This driver stores:
 *   - sessions  → Upstash Redis (JSON by key, with a TTL matching the session expiry)
 *   - photos     → Vercel Blob, stored private (the returned URL is an opaque,
 *                   server-side reference — never a public link handed to the browser)
 *
 * Clients are constructed lazily and only when this driver is selected (see ./index),
 * so the packages are never loaded in local dev or tests. Images are still served
 * through our own authenticated route (fetched server-side with the read-write token,
 * then streamed), so a Blob URL is never exposed as an unauthenticated public link.
 */

import { randomUUID } from "node:crypto";
import type { Session } from "../types";
import { collectPhotoRefs, hydrateSession, newSession, type PhotoExt, type StoreDriver } from "./shared";

type Blob = typeof import("@vercel/blob");
type RedisClient = import("@upstash/redis").Redis;

let blobMod: Blob | null = null;
async function blob(): Promise<Blob> {
  if (!blobMod) blobMod = await import("@vercel/blob");
  return blobMod;
}
function blobToken(): string {
  return process.env.BLOB_READ_WRITE_TOKEN ?? "";
}

let redisClient: RedisClient | null = null;
function redisEnv(): { url?: string; token?: string } {
  return {
    url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || process.env.KV_URL,
    token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN
  };
}
async function redis(): Promise<RedisClient> {
  if (!redisClient) {
    const { Redis } = await import("@upstash/redis");
    const { url, token } = redisEnv();
    if (!url || !token) throw new Error("Redis (KV) is not configured");
    redisClient = new Redis({ url, token });
  }
  return redisClient;
}

const sessionKey = (id: string) => `session:${id}`;

/** Seconds until the session expires, floored at 60 so a KV TTL is always positive. */
function ttlSeconds(session: Session): number {
  const ms = new Date(session.expiresAt).getTime() - Date.now();
  return Math.max(60, Math.ceil(ms / 1000));
}

function asSession(raw: unknown): Session | null {
  if (!raw) return null;
  const session = (typeof raw === "string" ? JSON.parse(raw) : raw) as Session;
  hydrateSession(session);
  return session;
}

async function createSession(): Promise<Session> {
  const r = await redis();
  const session = newSession();
  await r.set(sessionKey(session.id), session, { ex: ttlSeconds(session) });
  return session;
}

async function getSession(id: string): Promise<Session | null> {
  try {
    const r = await redis();
    return asSession(await r.get<Session | string>(sessionKey(id)));
  } catch {
    return null;
  }
}

async function saveSession(session: Session): Promise<Session> {
  const r = await redis();
  await r.set(sessionKey(session.id), session, { ex: ttlSeconds(session) });
  return session;
}

async function deleteSession(id: string): Promise<void> {
  const session = await getSession(id);
  if (session) {
    const refs = collectPhotoRefs(session).filter((ref) => /^https?:\/\//.test(ref));
    if (refs.length) {
      try {
        const { del } = await blob();
        await del(refs, { token: blobToken() });
      } catch {
        // best-effort cleanup
      }
    }
  }
  try {
    const r = await redis();
    await r.del(sessionKey(id));
  } catch {
    // already gone
  }
}

async function storePhoto(id: string, bytes: Buffer, ext: PhotoExt = "jpg"): Promise<string> {
  const { put } = await blob();
  const contentType =
    ext === "svg" ? "image/svg+xml" : ext === "png" ? "image/png" : "image/jpeg";
  const result = await put(`photos/${id}.${ext}`, new Uint8Array(bytes), {
    access: "private",
    contentType,
    addRandomSuffix: true,
    token: blobToken()
  });
  return result.url;
}

async function readPhoto(ref: string): Promise<Buffer | null> {
  if (!ref || !/^https?:\/\//.test(ref)) return null;
  try {
    const { get } = await blob();
    const result = await get(ref, { access: "private", token: blobToken() });
    if (!result || result.statusCode !== 200 || !result.stream) return null;
    const reader = result.stream.getReader();
    const chunks: Uint8Array[] = [];
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) chunks.push(value);
    }
    return Buffer.concat(chunks);
  } catch {
    return null;
  }
}

/**
 * Cross-instance per-session lock via Redis SET NX PX. Serverless requests for the
 * same session can land on different instances, so the in-process mutex used by the
 * file driver is not enough. Acquisition is bounded and fails OPEN (proceeds without
 * the lock) rather than deadlocking the request; release is best-effort and only
 * deletes the key when we still own it.
 */
async function withSessionLock<T>(id: string, fn: () => Promise<T>): Promise<T> {
  let release: (() => Promise<void>) | null = null;
  try {
    const r = await redis();
    const key = `lock:session:${id}`;
    const owner = randomUUID();
    for (let attempt = 0; attempt < 40; attempt++) {
      const ok = await r.set(key, owner, { nx: true, px: 15000 });
      if (ok === "OK") {
        release = async () => {
          try {
            if (String(await r.get(key)) === owner) await r.del(key);
          } catch {
            // ignore — the PX TTL will clear it
          }
        };
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 50 + Math.random() * 50));
    }
  } catch {
    // If Redis is unreachable for locking, proceed without it (availability over
    // strict serialization). The read-modify-write is still bounded and fast.
  }
  try {
    return await fn();
  } finally {
    if (release) await release();
  }
}

export const cloudDriver: StoreDriver = {
  createSession,
  getSession,
  saveSession,
  deleteSession,
  storePhoto,
  readPhoto,
  withSessionLock
};
