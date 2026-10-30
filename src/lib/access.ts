/**
 * LookAhead — Private Preview access gate (server-side only).
 *
 * The deployed app uses the platform's own YouCam key, held in the server
 * environment (`YOUCAM_API_KEY`) and never exposed to the browser. To keep that
 * shared allocation private, the live experience sits behind a lightweight
 * "Private Preview" access pass — NOT an account/login system.
 *
 * How it works:
 *   1. The browser POSTs an entered pass to `/api/access`.
 *   2. We compare it, in constant time, with `process.env.LOOKAHEAD_ACCESS_CODE`.
 *   3. On a match we set an HTTP-only, SameSite (Secure in production) cookie
 *      holding a signed, expiring token. The YouCam key is never returned, never
 *      stored in the browser, and never logged.
 *   4. Protected routes call `requireAccess(request)`; the token is verified from
 *      the cookie before the server makes any YouCam call with its own env key.
 *
 * The token is stateless: `base64url(expiry).base64url(hmac)` signed with a key
 * derived from the access code, so there is no server-side session table. It is
 * unforgeable without the code and self-expires. If `LOOKAHEAD_ACCESS_CODE` is
 * unset (local development), the gate is inert and everything is authorized —
 * there are NO hardcoded fallback secrets.
 */

import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { ApiError } from "@/lib/api/http";

/** Name of the HTTP-only authorization cookie. */
export const ACCESS_COOKIE = "la_access";

/** How long an accepted pass stays authorized (temporary, but judge-friendly). */
export const ACCESS_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/** Domain-separation tag so the signing key is never the raw access code. */
const SIGNING_CONTEXT = "lookahead.access.cookie.v1";

/* ── Brute-force protection (basic, in-memory) ─────────────────────────────── */

const MAX_ATTEMPTS = 8;
const WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const attempts = new Map<string, { count: number; resetAt: number }>();

/**
 * The configured access code, trimmed, or `null` when unset. Read lazily so tests
 * can toggle `process.env.LOOKAHEAD_ACCESS_CODE` per case. Never logged.
 */
export function accessCode(): string | null {
  const value = process.env.LOOKAHEAD_ACCESS_CODE;
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

/** True when a pass is required (i.e. an access code is configured). */
export function accessRequired(): boolean {
  return Boolean(accessCode());
}

/**
 * Length-independent, constant-time string equality. Both inputs are hashed to a
 * fixed 32-byte digest first, so neither the length nor a partial prefix match is
 * observable through timing.
 */
function safeEqual(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  try {
    return timingSafeEqual(ha, hb);
  } catch {
    return false;
  }
}

/** Verify an entered pass against the configured code. Generic on every failure. */
export function verifyAccessCode(input: unknown): boolean {
  const expected = accessCode();
  if (!expected || typeof input !== "string") return false;
  const given = input.trim();
  if (!given) return false;
  return safeEqual(given, expected);
}

/* ── Signed, expiring cookie token ─────────────────────────────────────────── */

function signingKey(): Buffer {
  return createHash("sha256").update(`${SIGNING_CONTEXT}|${accessCode() ?? ""}`).digest();
}

function toB64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64url(value: string): Buffer {
  const pad = value.length % 4 === 0 ? "" : "=".repeat(4 - (value.length % 4));
  return Buffer.from(value.replace(/-/g, "+").replace(/_/g, "/") + pad, "base64");
}

/** Mint a token that expires `ACCESS_TTL_MS` from `now`. */
export function createAccessToken(now: number = Date.now()): string {
  const expiry = now + ACCESS_TTL_MS;
  const payload = toB64url(Buffer.from(String(expiry), "utf8"));
  const signature = toB64url(createHmac("sha256", signingKey()).update(payload).digest());
  return `${payload}.${signature}`;
}

/** True only for a well-formed, correctly-signed, unexpired token. */
export function verifyAccessToken(token: string | null | undefined, now: number = Date.now()): boolean {
  if (!token || typeof token !== "string") return false;
  const parts = token.split(".");
  if (parts.length !== 2) return false;
  const [payload, signature] = parts;
  if (!payload || !signature) return false;

  const expected = toB64url(createHmac("sha256", signingKey()).update(payload).digest());
  if (!safeEqual(signature, expected)) return false;

  let expiry: number;
  try {
    expiry = Number.parseInt(fromB64url(payload).toString("utf8"), 10);
  } catch {
    return false;
  }
  return Number.isFinite(expiry) && expiry > now;
}

/* ── Request helpers ───────────────────────────────────────────────────────── */

/** Read the access cookie value from a request's Cookie header (no next/headers). */
export function readAccessCookie(request: Request): string | null {
  const header = request.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === ACCESS_COOKIE) {
      try {
        return decodeURIComponent(part.slice(eq + 1).trim());
      } catch {
        return part.slice(eq + 1).trim();
      }
    }
  }
  return null;
}

/**
 * Whether this request is authorized to use the live functionality. When no access
 * code is configured (local dev), everything is authorized; otherwise a valid,
 * unexpired cookie token is required.
 */
export function isAuthorized(request: Request): boolean {
  if (!accessRequired()) return true;
  return verifyAccessToken(readAccessCookie(request));
}

/**
 * Gate for provider-backed routes. Throws a generic 401 (`access_required`) when a
 * pass is required but the request is not authorized — the client reacts by showing
 * the Private Preview screen. The message never reveals the code or the key.
 */
export function requireAccess(request: Request): void {
  if (!isAuthorized(request)) {
    throw new ApiError(
      401,
      "access_required",
      "Preview access is required. Enter your LookAhead access pass to continue."
    );
  }
}

/* ── Cookie serialization ──────────────────────────────────────────────────── */

function isSecureRequest(request: Request): boolean {
  if (process.env.NODE_ENV === "production") return true;
  const proto = request.headers.get("x-forwarded-proto");
  return proto?.split(",")[0].trim() === "https";
}

/** A fresh authorization cookie for a just-accepted pass. */
export function accessCookie(request: Request): string {
  const maxAge = Math.floor(ACCESS_TTL_MS / 1000);
  const secure = isSecureRequest(request) ? "; Secure" : "";
  return `${ACCESS_COOKIE}=${createAccessToken()}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

/** Expire the authorization cookie (used after a rejected attempt). */
export function clearAccessCookie(): string {
  return `${ACCESS_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

/* ── Rate limiting ─────────────────────────────────────────────────────────── */

/** Best-effort client identifier for rate limiting (never a secret, never logged). */
export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return request.headers.get("x-real-ip")?.trim() || "local";
}

/**
 * Sliding-window attempt counter. Returns whether the attempt is allowed and, when
 * not, how long to wait. Opportunistically prunes expired buckets so the map stays
 * bounded. In-memory only: adequate basic protection for a single-instance preview
 * deploy (see TESTING.md for the serverless caveat).
 */
export function rateLimit(key: string, now: number = Date.now()): { allowed: boolean; retryAfterMs: number } {
  if (attempts.size > 1000) {
    for (const [k, entry] of attempts) if (now >= entry.resetAt) attempts.delete(k);
  }
  const entry = attempts.get(key);
  if (!entry || now >= entry.resetAt) {
    attempts.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return { allowed: true, retryAfterMs: 0 };
  }
  entry.count += 1;
  if (entry.count > MAX_ATTEMPTS) return { allowed: false, retryAfterMs: Math.max(0, entry.resetAt - now) };
  return { allowed: true, retryAfterMs: 0 };
}

/** Clear the counter for a key after a successful validation. */
export function resetRateLimit(key: string): void {
  attempts.delete(key);
}

/** Test helper: drop all rate-limit state. */
export function _resetRateLimits(): void {
  attempts.clear();
}
