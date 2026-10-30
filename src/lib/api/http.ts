/**
 * Shared server-side helpers for App Router route handlers.
 *
 * These centralise the three things every route needs and must get right:
 *   1. a consistent JSON error shape,
 *   2. anonymous-session ownership checks (id alone is never authorization),
 *   3. secret-free responses (the API key never leaves the server).
 */

import { NextResponse } from "next/server";
import { getConfig } from "../config";
import { getSession, isExpired, ownsSession } from "../store";
import type { Session } from "../types";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string
  ) {
    super(message);
  }
}

/** A consistent, non-leaky error body. */
export function errorResponse(status: number, code: string, message: string): NextResponse {
  return NextResponse.json({ error: { code, message } }, { status });
}

export function fromError(err: unknown): NextResponse {
  if (err instanceof ApiError) return errorResponse(err.status, err.code, err.message);
  // Never leak internals; log server-side only.
  console.error("[api] unexpected error", err);
  return errorResponse(500, "internal_error", "Something went wrong on our side. Please try again.");
}

/** Read the ownership token from a header or query param (needed for <img> src). */
export function readToken(request: Request): string | null {
  const header = request.headers.get("x-session-token");
  if (header) return header;
  try {
    const url = new URL(request.url);
    return url.searchParams.get("token");
  } catch {
    return null;
  }
}

export interface AuthedSession {
  session: Session;
}

/**
 * Load a session and verify ownership + expiry. Throws ApiError otherwise, so a
 * route handler can `await requireSession(...)` and trust the result.
 */
export async function requireSession(id: string, request: Request): Promise<AuthedSession> {
  const token = readToken(request);
  const session = await getSession(id);
  if (!session) throw new ApiError(404, "session_not_found", "We couldn't find that session.");
  if (!ownsSession(session, token)) {
    throw new ApiError(403, "forbidden", "You don't have access to this session.");
  }
  if (isExpired(session)) {
    throw new ApiError(410, "session_expired", "This session has expired. You can start a fresh one.");
  }
  return { session };
}

/** Parse + validate a JSON body with a Zod schema; throw a 400 ApiError on failure. */
export async function parseBody<T>(request: Request, schema: { safeParse: (v: unknown) => { success: true; data: T } | { success: false; error: { message: string } } }): Promise<T> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    throw new ApiError(400, "invalid_json", "Expected a JSON body.");
  }
  const result = schema.safeParse(raw);
  if (!result.success) throw new ApiError(400, "validation_error", result.error.message);
  return result.data;
}

/** Small helper so routes can report whether results are simulated. */
export function providerMode(): "mock" | "live" {
  return getConfig().youcam.liveReady ? "live" : "mock";
}

/** No-store caching for anything session-scoped or dynamic. */
export const dynamicRoute = { dynamic: "force-dynamic" as const };
