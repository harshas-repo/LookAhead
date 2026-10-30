/**
 * LookAhead — persistence layer (driver selector).
 *
 * The store sits behind a small `StoreDriver` interface so a user can return to
 * their plan across reloads (tech-implementation.md §1 / §10) regardless of host.
 * Two drivers share that interface:
 *
 *   - `./fs`     file-backed store for local dev / hosts with a real disk.
 *   - `./cloud`  Vercel-native store (Blob for photos + Redis for sessions) for
 *                serverless, where the filesystem is read-only and /tmp is
 *                ephemeral per-instance.
 *
 * The cloud driver is selected only when BOTH a Blob token and a Redis endpoint
 * are present in the environment; otherwise we fall back to the file driver, so
 * local development and tests are unchanged. Route handlers import the plain
 * functions below and never need to know which driver is active.
 */

import { fsDriver } from "./fs";
import type { PhotoExt, StoreDriver } from "./shared";
import type { Session } from "../types";

// Pure, driver-agnostic helpers are re-exported so callers keep importing them
// from "@/lib/store" exactly as before.
export {
  contentTypeForPath,
  generateId,
  generateToken,
  hydrateSession,
  isExpired,
  newSession,
  ownsSession
} from "./shared";

/**
 * True when the environment provides everything the cloud driver needs: a Vercel
 * Blob token AND a reachable Redis (Upstash KV) endpoint. Detected from the several
 * env-var spellings Vercel/Upstash integrations use, so connecting the stores in the
 * dashboard (which injects these automatically) is enough to activate cloud storage.
 */
function cloudReady(): boolean {
  const hasBlob = Boolean(process.env.BLOB_READ_WRITE_TOKEN);
  const hasRedisUrl = Boolean(
    process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || process.env.KV_URL
  );
  const hasRedisToken = Boolean(
    process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN
  );
  return hasBlob && hasRedisUrl && hasRedisToken;
}

let driverPromise: Promise<StoreDriver> | null = null;

/** Resolve the active driver once, lazily importing ./cloud only when selected. */
function getDriver(): Promise<StoreDriver> {
  if (!driverPromise) {
    driverPromise = cloudReady()
      ? import("./cloud").then((m) => m.cloudDriver)
      : Promise.resolve(fsDriver);
  }
  return driverPromise;
}

export async function createSession(): Promise<Session> {
  return (await getDriver()).createSession();
}

export async function getSession(id: string): Promise<Session | null> {
  return (await getDriver()).getSession(id);
}

export async function saveSession(session: Session): Promise<Session> {
  return (await getDriver()).saveSession(session);
}

export async function deleteSession(id: string): Promise<void> {
  return (await getDriver()).deleteSession(id);
}

export async function storePhoto(
  id: string,
  bytes: Buffer,
  ext: PhotoExt = "jpg"
): Promise<string> {
  return (await getDriver()).storePhoto(id, bytes, ext);
}

export async function readPhoto(ref: string): Promise<Buffer | null> {
  return (await getDriver()).readPhoto(ref);
}

export async function withSessionLock<T>(id: string, fn: () => Promise<T>): Promise<T> {
  return (await getDriver()).withSessionLock(id, fn);
}
