/**
 * LookAhead — persistence layer.
 *
 * A minimal, durable, file-backed store so a user can return to their plan
 * across reloads (tech-implementation.md §1 / §10). Sessions are stored as JSON
 * under `<dataDir>/sessions/<id>.json`; uploaded photos are stored as separate
 * files under `<dataDir>/photos/` — never as bytes inside the session record.
 *
 * The store is intentionally behind a small interface so it can be swapped for a
 * real database without touching route handlers.
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import { randomBytes, randomUUID } from "node:crypto";
import { getConfig } from "../config";
import type { Session } from "../types";

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

async function ensureDirs(): Promise<void> {
  await fs.mkdir(sessionsDir(), { recursive: true });
  await fs.mkdir(photosDir(), { recursive: true });
}

/** An unpredictable token used for ownership checks (instruction §10). */
export function generateToken(): string {
  return randomBytes(32).toString("base64url");
}

export function generateId(prefix: string): string {
  return `${prefix}_${randomUUID().replace(/-/g, "").slice(0, 20)}`;
}

/** Create a fresh, empty session with sensible defaults. */
export function newSession(): Session {
  const now = Date.now();
  const ttl = getConfig().session.ttlMs;
  return {
    id: generateId("sess"),
    token: generateToken(),
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + ttl).toISOString(),
    currentStage: "START",
    profile: {
      priorities: [],
      topPriorities: [],
      optionalTreatmentDate: null,
      consent: { granted: false, grantedAt: null }
    },
    hairRecord: { photoRef: null, anglePhotos: { right: null, left: null, density: null }, analysis: null, density: null, type: null },
    previews: [],
    decisions: [],
    plan: { planA: null, planB: null, questionsForCareTeam: [], updatedAt: null },
    previewBudgetUsed: 0
  };
}

export async function createSession(): Promise<Session> {
  await ensureDirs();
  const session = newSession();
  await fs.writeFile(sessionPath(session.id), JSON.stringify(session, null, 2), "utf8");
  return session;
}

export async function getSession(id: string): Promise<Session | null> {
  try {
    const raw = await fs.readFile(sessionPath(id), "utf8");
    const session = JSON.parse(raw) as Session;
    hydrateSession(session);
    if (isExpired(session)) return session; // returned but flagged; routes decide
    return session;
  } catch {
    return null;
  }
}

/**
 * Forward-compatibility: fill in fields added after a session JSON was first
 * written, so older on-disk sessions never crash routes that read the newer
 * shape (multi-angle photos, density/type results, preview family).
 */
function hydrateSession(session: Session): void {
  const hr = session.hairRecord;
  if (hr) {
    if (!hr.anglePhotos) hr.anglePhotos = { right: null, left: null, density: null };
    if (hr.density === undefined) hr.density = null;
    if (hr.type === undefined) hr.type = null;
  }
  if (Array.isArray(session.previews)) {
    for (const p of session.previews) {
      if (!p.family) p.family = "hairstyle";
    }
  }
}

export async function saveSession(session: Session): Promise<Session> {
  await ensureDirs();
  await fs.writeFile(sessionPath(session.id), JSON.stringify(session, null, 2), "utf8");
  return session;
}

/**
 * Per-session write serialization.
 *
 * The store is a whole-file read-modify-write, so two concurrent mutations of the
 * SAME session (e.g. the parallel "Preview all" creates, or several preview polls
 * finishing at once) would each save a stale in-memory copy and clobber the other —
 * orphaning a preview the client is already polling (which then 404s forever). This
 * promise-chain mutex makes such critical sections run one-at-a-time per session id.
 *
 * It is held ONLY for the fast local read+mutate+write, never across slow provider
 * calls, so parallel work still overlaps where it actually matters. Single-process
 * by design (this file-backed store is), which is exactly the level the race occurs.
 */
const sessionLocks = new Map<string, Promise<void>>();

export function withSessionLock<T>(id: string, fn: () => Promise<T>): Promise<T> {
  const prev = sessionLocks.get(id) ?? Promise.resolve();
  // Run fn once the previous holder settles (prev never rejects — tails swallow).
  const run = prev.then(fn, fn);
  const tail = run.then(
    () => undefined,
    () => undefined
  );
  sessionLocks.set(id, tail);
  void tail.finally(() => {
    // Drop the map entry when nothing is queued behind this call.
    if (sessionLocks.get(id) === tail) sessionLocks.delete(id);
  });
  return run;
}

export function isExpired(session: Session): boolean {
  return Date.now() > new Date(session.expiresAt).getTime();
}

/**
 * Ownership check: the caller must present the session token. We never trust a
 * client-supplied id alone as authorization (tech-implementation.md §4).
 */
export function ownsSession(session: Session, token: string | null): boolean {
  return Boolean(token) && token === session.token;
}

/** Persist a normalized photo/result buffer; returns a private relative path. */
export async function storePhoto(id: string, bytes: Buffer, ext: "jpg" | "svg" | "png" = "jpg"): Promise<string> {
  await ensureDirs();
  const rel = path.join("photos", `${id}.${ext}`);
  await fs.writeFile(path.join(dataRoot(), rel), new Uint8Array(bytes));
  return rel;
}

/** Content type for a stored image path. */
export function contentTypeForPath(rel: string): string {
  if (rel.endsWith(".svg")) return "image/svg+xml";
  if (rel.endsWith(".png")) return "image/png";
  return "image/jpeg";
}

export function photoAbsPath(rel: string): string {
  return path.join(dataRoot(), rel);
}

export async function readPhoto(rel: string): Promise<Buffer | null> {
  try {
    return await fs.readFile(photoAbsPath(rel));
  } catch {
    return null;
  }
}

/** Delete a session and all of its stored photos (privacy reset — §13). */
export async function deleteSession(id: string): Promise<void> {
  const session = await getSession(id);
  if (session) {
    const refs = new Set<string>();
    if (session.hairRecord.photoRef) refs.add(session.hairRecord.photoRef.storedPath);
    const angles = session.hairRecord.anglePhotos;
    if (angles) {
      if (angles.right) refs.add(angles.right.storedPath);
      if (angles.left) refs.add(angles.left.storedPath);
      if (angles.density) refs.add(angles.density.storedPath);
    }
    for (const preview of session.previews) {
      if (preview.outputImageRef && preview.outputImageRef.startsWith("photos/")) {
        refs.add(preview.outputImageRef);
      }
    }
    for (const rel of refs) {
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
}
