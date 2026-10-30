import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  ACCESS_COOKIE,
  ACCESS_TTL_MS,
  _resetRateLimits,
  accessCookie,
  accessRequired,
  clearAccessCookie,
  createAccessToken,
  isAuthorized,
  rateLimit,
  readAccessCookie,
  requireAccess,
  verifyAccessCode,
  verifyAccessToken
} from "./access";
import { ApiError } from "./api/http";
import { accessRequestSchema } from "./validation";

const CODE = "LOOKAHEAD-TEST-1234";

/**
 * A minimal Request stand-in: the access helpers only ever read headers, and a bare
 * Headers object (guard "none") lets us set `cookie` without undici's request-header
 * filtering. Keeps the test independent of the runtime's Request implementation.
 */
function req(cookie?: string): Request {
  const headers = new Headers();
  if (cookie) headers.set("cookie", cookie);
  return { headers } as unknown as Request;
}

describe("access gate", () => {
  const original = process.env.LOOKAHEAD_ACCESS_CODE;

  beforeEach(() => {
    process.env.LOOKAHEAD_ACCESS_CODE = CODE;
    _resetRateLimits();
  });

  afterEach(() => {
    if (original === undefined) delete process.env.LOOKAHEAD_ACCESS_CODE;
    else process.env.LOOKAHEAD_ACCESS_CODE = original;
    _resetRateLimits();
  });

  it("requires a pass when a code is configured", () => {
    expect(accessRequired()).toBe(true);
  });

  it("verifies the code exactly and generically (no partial credit)", () => {
    expect(verifyAccessCode(CODE)).toBe(true);
    expect(verifyAccessCode(`  ${CODE}  `)).toBe(true); // trimmed
    expect(verifyAccessCode("wrong")).toBe(false);
    expect(verifyAccessCode("")).toBe(false);
    expect(verifyAccessCode(CODE.slice(0, CODE.length - 1))).toBe(false); // near-miss
    expect(verifyAccessCode(CODE.toLowerCase())).toBe(false); // case-sensitive
    expect(verifyAccessCode(undefined)).toBe(false);
    expect(verifyAccessCode(123)).toBe(false);
  });

  it("mints a token that verifies and rejects tampering", () => {
    const token = createAccessToken();
    expect(verifyAccessToken(token)).toBe(true);
    const [payload, signature] = token.split(".");
    expect(verifyAccessToken(`${payload}.AAAA`)).toBe(false); // bad signature
    expect(verifyAccessToken(`${payload}x.${signature}`)).toBe(false); // tampered payload
    expect(verifyAccessToken("garbage")).toBe(false);
    expect(verifyAccessToken(null)).toBe(false);
    expect(verifyAccessToken(undefined)).toBe(false);
  });

  it("expires a token after the TTL", () => {
    const now = Date.now();
    const token = createAccessToken(now);
    expect(verifyAccessToken(token, now + ACCESS_TTL_MS - 1000)).toBe(true);
    expect(verifyAccessToken(token, now + ACCESS_TTL_MS + 1000)).toBe(false);
  });

  it("reads the access cookie from a request", () => {
    const token = createAccessToken();
    expect(readAccessCookie(req(`${ACCESS_COOKIE}=${token}`))).toBe(token);
    expect(readAccessCookie(req(`other=1; ${ACCESS_COOKIE}=${token}; x=2`))).toBe(token);
    expect(readAccessCookie(req())).toBe(null);
  });

  it("authorizes only with a valid cookie when a pass is required", () => {
    const token = createAccessToken();
    expect(isAuthorized(req(`${ACCESS_COOKIE}=${token}`))).toBe(true);
    expect(isAuthorized(req(`${ACCESS_COOKIE}=nope`))).toBe(false);
    expect(isAuthorized(req())).toBe(false);
  });

  it("requireAccess throws a generic 401 that never leaks the code", () => {
    expect(() => requireAccess(req())).toThrowError(ApiError);
    try {
      requireAccess(req());
      throw new Error("expected requireAccess to throw");
    } catch (err) {
      const apiErr = err as ApiError;
      expect(apiErr.status).toBe(401);
      expect(apiErr.code).toBe("access_required");
      expect(apiErr.message).not.toContain(CODE);
    }
    const token = createAccessToken();
    expect(() => requireAccess(req(`${ACCESS_COOKIE}=${token}`))).not.toThrow();
  });

  it("is inert (everything authorized) when no code is configured", () => {
    delete process.env.LOOKAHEAD_ACCESS_CODE;
    expect(accessRequired()).toBe(false);
    expect(isAuthorized(req())).toBe(true);
    expect(() => requireAccess(req())).not.toThrow();
    expect(verifyAccessCode("anything")).toBe(false); // nothing to match against
  });

  it("serializes an HttpOnly, SameSite authorization cookie", () => {
    const cookie = accessCookie(req());
    expect(cookie.startsWith(`${ACCESS_COOKIE}=`)).toBe(true);
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain("Path=/");
    expect(cookie).toContain("Max-Age=");
    expect(clearAccessCookie()).toContain("Max-Age=0");
  });

  it("rate-limits repeated attempts per key", () => {
    const key = "1.2.3.4";
    for (let i = 0; i < 8; i++) expect(rateLimit(key).allowed).toBe(true);
    const blocked = rateLimit(key);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterMs).toBeGreaterThan(0);
    expect(rateLimit("9.9.9.9").allowed).toBe(true); // other keys unaffected
  });
});

describe("accessRequestSchema", () => {
  it("accepts a non-empty code and rejects empty/missing/oversize", () => {
    expect(accessRequestSchema.safeParse({ code: "LOOKAHEAD-1" }).success).toBe(true);
    expect(accessRequestSchema.safeParse({ code: "" }).success).toBe(false);
    expect(accessRequestSchema.safeParse({}).success).toBe(false);
    expect(accessRequestSchema.safeParse({ code: "x".repeat(201) }).success).toBe(false);
  });
});
