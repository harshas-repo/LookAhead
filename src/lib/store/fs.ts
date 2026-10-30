/**
 * Store driver — local file system (development / persistent-disk hosts).
 *
 * Sessions are JSON files under `<dataDir>/sessions/<id>.json`; photos are separate
 * files under `<dataDir>/photos/`. Requires a writable, durable filesystem, so it is
 * used for local dev (and any host with a real disk) — NOT on Vercel's read-only,
 * ephemeral serverless filesystem, which uses the `./cloud` driver instead.
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import { getConfig } from "../config";
import type { Session } from "../types";
import { collectPhotoRefs, hydrateSession, newSession, type PhotoExt, type StoreDriver } from "./shared";

function dataRoot(): string {
  return path.resolve(process.cwd(), getConfig().dataDir);
}
function sessionsDir(): string {
  return path.join(dataRoot(), "sessions");
}
function photosDir(): string {
  return path.join(dataRoot(), "photos");
}
function sessionPath(id: string): string {
  return path.join(sessionsDir(), `${id}.json`);
}
function photoAbsPath(rel: string): string {
  return path.join(dataRoot(), rel);
}

async function ensureDirs(): Promise<void> {
  await fs.mkdir(sessionsDir(), { recursive: true });
  await fs.mkdir(photosDir(), { recursive: true });
}

/**
 * Per-session write serialization. The store is a whole-file read-modify-write, so two
 * concurrent mutations of the SAME session (e.g. parallel preview creates, or several
 * polls finishing at once) would each save a stale copy and clobber the other. This
 * promise-chain mutex runs such critical sections one-at-a-time per session id. It is
 * held only for the fast local read+mutate+write, never across slow provider calls.
 * Single-process by design (which is exactly the level the race occurs on one host).
 */
const sessionLocks = new Map<string, Promise<void>>();

function withSessionLock<T>(id: string, fn: () => Promise<T>): Promise<T> {
  const prev = sessionLocks.get(id) ?? Promise.resolve();
  const run = prev.then(fn, fn);
  const tail = run.then(
    () => undefined,
    () => undefined
  );
  sessionLocks.set(id, tail);
  void tail.finally(() => {
    if (sessionLocks.get(id) === tail) sessionLocks.delete(id);
  });
  return run;
}

export const fsDriver: StoreDriver = {
  async createSession(): Promise<Session> {
    await ensureDirs();
    const session = newSession();
    await fs.writeFile(sessionPath(session.id), JSON.stringify(session, null, 2), "utf8");
    return session;
  },

  async getSession(id: string): Promise<Session | null> {
    try {
      const raw = await fs.readFile(sessionPath(id), "utf8");
      const session = JSON.parse(raw) as Session;
      hydrateSession(session);
      return session; // expiry is decided by callers (requireSession)
    } catch {
      return null;
    }
  },

  async saveSession(session: Session): Promise<Session> {
    await ensureDirs();
    await fs.writeFile(sessionPath(session.id), JSON.stringify(session, null, 2), "utf8");
    return session;
  },

  async deleteSession(id: string): Promise<void> {
    const session = await fsDriver.getSession(id);
    if (session) {
      for (const rel of collectPhotoRefs(session)) {
        try {
          await fs.unlink(photoAbsPath(rel));
        } catch {
          // best-effort cleanup
        }
      }
    }
    try {
      await fs.unlink(sessionPath(id));
    } catch {
      // already gone
    }
  },

  async storePhoto(id: string, bytes: Buffer, ext: PhotoExt = "jpg"): Promise<string> {
    await ensureDirs();
    // Forward-slash relative ref so it is portable and matches the "photos/" prefix
    // checks; path.join below normalizes it for the local OS.
    const rel = `photos/${id}.${ext}`;
    await fs.writeFile(path.join(dataRoot(), rel), new Uint8Array(bytes));
    return rel;
  },

  async readPhoto(ref: string): Promise<Buffer | null> {
    try {
      return await fs.readFile(photoAbsPath(ref));
    } catch {
      return null;
    }
  },

  withSessionLock
};
