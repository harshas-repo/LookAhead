/**
 * /api/access — Private Preview access gate.
 *
 *   GET  → { required, authorized }   (secret-free status the client gate reads)
 *   POST → { code }                   validate the pass; on success set an
 *                                     HTTP-only, expiring authorization cookie.
 *
 * The expected pass and the YouCam key never leave the server. Failures return a
 * generic message (no hint about partial matches), and POST is rate-limited to
 * blunt brute-force guessing.
 */

import { NextResponse } from "next/server";
import {
  accessCookie,
  accessRequired,
  clearAccessCookie,
  clientIp,
  isAuthorized,
  rateLimit,
  resetRateLimit,
  verifyAccessCode
} from "@/lib/access";
import { accessRequestSchema } from "@/lib/validation";
import { fromError, parseBody } from "@/lib/api/http";

export const dynamic = "force-dynamic";

const NO_STORE = { "cache-control": "no-store" } as const;

export async function GET(request: Request): Promise<NextResponse> {
  try {
    return NextResponse.json(
      { required: accessRequired(), authorized: isAuthorized(request) },
      { headers: NO_STORE }
    );
  } catch (err) {
    return fromError(err);
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const ip = clientIp(request);
    const limit = rateLimit(ip);
    if (!limit.allowed) {
      return NextResponse.json(
        {
          error: {
            code: "too_many_attempts",
            message: "Too many attempts. Please wait a few minutes and try again."
          }
        },
        { status: 429, headers: { ...NO_STORE, "retry-after": String(Math.ceil(limit.retryAfterMs / 1000)) } }
      );
    }

    const body = await parseBody(request, accessRequestSchema);

    if (!verifyAccessCode(body.code)) {
      // Generic on every failure; also drop any stale cookie. Never reveal the code.
      const res = NextResponse.json(
        {
          error: {
            code: "invalid_access_code",
            message: "That access pass isn't valid. Please check the code and try again."
          }
        },
        { status: 401, headers: NO_STORE }
      );
      res.headers.append("Set-Cookie", clearAccessCookie());
      return res;
    }

    resetRateLimit(ip);
    const res = NextResponse.json({ ok: true, authorized: true }, { headers: NO_STORE });
    res.headers.append("Set-Cookie", accessCookie(request));
    return res;
  } catch (err) {
    return fromError(err);
  }
}
