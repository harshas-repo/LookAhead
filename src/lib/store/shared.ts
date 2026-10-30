/**
 * Store — shared, driver-agnostic pieces.
 *
 * The persistence layer is split behind a small `StoreDriver` interface so the app
 * can run on a local file-backed store (development) or on Vercel-native storage
 * (Blob for photos + Redis for sessions) without touching a single route handler.
 * This module holds the pure helpers both drivers share; the drivers live in
 * `./fs` and `./cloud`, and `./index` selects between them by environment.
 */

import { randomBytes, randomUUID } from "node:crypto";
import { getConfig } from "../config";
import type { Session } from "../types";

export type PhotoExt = "jpg" | "svg" | "png";

/** The persistence contract every driver implements. */
export interface StoreDriver {
  createSession(): Promise<Session>;
  getSession(id: string): Promise<Session | null>;
  saveSession(session: Session): Promise<Session>;
  deleteSession(id: string): Promise<void>;
  /** Persist a photo/result buffer; returns an opaque reference the driver can read back. */
  storePhoto(id: string, bytes: Buffer, ext?: PhotoExt): Promise<string>;
  readPhoto(ref: string): Promise<Buffer | null>;
  /** Serialize concurrent read-modify-write of the SAME session. */
  withSessionLock<T>(id: string, fn: () => Promise<T>): Promise<T>;
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

/**
 * Forward-compatibility: fill in fields added after a session was first written, so
 * older stored sessions never crash routes that read the newer shape (multi-angle
 * photos, density/type results, preview family).
 */
export function hydrateSession(session: Session): void {
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

/** Content type for a stored image reference (a relative path or a Blob URL). */
export function contentTypeForPath(ref: string): string {
  if (ref.endsWith(".svg")) return "image/svg+xml";
  if (ref.endsWith(".png")) return "image/png";
  return "image/jpeg";
}

/** Every photo/output reference a session holds, for privacy-reset cleanup. */
export function collectPhotoRefs(session: Session): string[] {
  const refs: string[] = [];
  const hr = session.hairRecord;
  if (hr?.photoRef) refs.push(hr.photoRef.storedPath);
  const angles = hr?.anglePhotos;
  if (angles?.right) refs.push(angles.right.storedPath);
  if (angles?.left) refs.push(angles.left.storedPath);
  if (angles?.density) refs.push(angles.density.storedPath);
  for (const preview of session.previews ?? []) {
    if (preview.outputImageRef) refs.push(preview.outputImageRef);
  }
  return refs.filter(Boolean);
}
