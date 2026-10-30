/**
 * LookAhead — runtime configuration.
 *
 * All provider credentials are read from server-side environment variables and
 * are NEVER exposed to the client bundle (instruction §11, §13). Values that the
 * browser may see are returned only through explicit, secret-free API responses.
 */

import type { ProviderMode } from "./types";

function num(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function mode(value: string | undefined): ProviderMode {
  return value === "live" ? "live" : "mock";
}

export interface AppConfig {
  providerMode: ProviderMode;
  youcam: {
    baseUrl: string;
    apiKey: string | null;
    hairstyleVersion: "v2.0" | "v2.1";
    /** True when we have enough config to attempt live calls. */
    liveReady: boolean;
  };
  limits: {
    maxPreviewsPerSession: number;
  };
  polling: {
    intervalMs: number;
    timeoutMs: number;
  };
  session: {
    ttlMs: number;
  };
  dataDir: string;
}

/**
 * Resolve configuration from the environment. Called server-side only.
 * `process.env` is read lazily so tests can override values.
 */
export function getConfig(): AppConfig {
  const env = process.env;
  const providerMode = mode(env.PROVIDER_MODE);
  // The YouCam key is a SERVER-SIDE secret only: read from the environment and used
  // for provider calls made by our own API routes. It is never exposed to the client
  // bundle and never sent to the browser. Access to the live functionality is gated
  // separately by the Private Preview access pass (see src/lib/access.ts).
  const apiKey = env.YOUCAM_API_KEY?.trim() ? env.YOUCAM_API_KEY.trim() : null;
  const hairstyleVersion = env.YOUCAM_HAIRSTYLE_VERSION === "v2.0" ? "v2.0" : "v2.1";

  return {
    providerMode,
    youcam: {
      baseUrl: env.YOUCAM_BASE_URL?.trim() || "https://yce-api-01.makeupar.com",
      apiKey,
      hairstyleVersion,
      // Live only when the deployment is explicitly set to live AND a server env key
      // is present. Otherwise stay in mock and clearly label results as simulated
      // (instruction §11).
      liveReady: providerMode === "live" && Boolean(apiKey)
    },
    limits: {
      // Generated previews are the only credit-spending action, so this is a pure
      // cost cap — independent of how many thumbnails the catalog surfaces (browsing
      // is free). 0 = unlimited (default): previews stay behind explicit buttons and
      // identical looks are reused, so credits are only spent on new renders. Set a
      // positive MAX_PREVIEWS_PER_SESSION to re-impose a hard ceiling.
      maxPreviewsPerSession: Math.max(0, num(env.MAX_PREVIEWS_PER_SESSION, 0))
    },
    polling: {
      // Brisk by default: live tasks typically complete in ~5-15s, so a 1s cadence
      // surfaces results as soon as they exist without hammering the provider.
      intervalMs: num(env.TASK_POLL_INTERVAL_MS, 1000),
      timeoutMs: num(env.TASK_POLL_TIMEOUT_MS, 120000)
    },
    session: {
      ttlMs: num(env.SESSION_TTL_MS, 7 * 24 * 60 * 60 * 1000)
    },
    dataDir: env.DATA_DIR?.trim() || ".data"
  };
}
