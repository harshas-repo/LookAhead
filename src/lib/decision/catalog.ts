/**
 * Server-side option catalog.
 *
 * Bridges the provider template lists (all four try-on families) to the curated,
 * priority-ordered options the UI shows. Template IDs always come from the provider
 * (never invented), and are cached briefly so we don't re-hit the network on every
 * request. Fetching is failure-tolerant per family: one family erroring still yields
 * the others, and a cached copy is served if every family fails.
 */

import { getTryOnAdapter } from "../providers";
import { TRY_ON_FAMILIES } from "../types";
import { buildOptions, orderOptionsByPriority } from "./options";
import type { AppearanceOption, Priority } from "../types";
import type { VtoTemplate } from "../providers/types";

const CACHE_TTL_MS = 5 * 60 * 1000;
let cache: { at: number; mode: string; templates: VtoTemplate[] } | null = null;

/**
 * The combined catalog across all four try-on families (hairstyle, extension, bangs,
 * volume), fetched in parallel. Each adapter tags its templates with its family, so
 * the combined list stays family-aware for options + preview routing. Cached for
 * CACHE_TTL_MS; a partial success is still cached so one family's outage doesn't
 * empty the whole grid.
 */
export async function getCatalog(mode: string): Promise<VtoTemplate[]> {
  const now = Date.now();
  if (cache && cache.mode === mode && now - cache.at < CACHE_TTL_MS) return cache.templates;

  const settled = await Promise.allSettled(
    TRY_ON_FAMILIES.map((family) => getTryOnAdapter(family).listTemplates())
  );

  const templates: VtoTemplate[] = [];
  let firstError: unknown = null;
  for (const result of settled) {
    if (result.status === "fulfilled") templates.push(...result.value);
    else if (firstError === null) firstError = result.reason;
  }

  if (templates.length > 0) {
    cache = { at: now, mode, templates };
    return templates;
  }

  // Every family failed. Serve a cached copy for this mode if we have one rather than
  // breaking the journey; otherwise rethrow so the route can respond cleanly.
  if (cache && cache.mode === mode) return cache.templates;
  throw firstError ?? new Error("template_catalog_unavailable");
}

/** Back-compat alias for the combined catalog (existing callers use this name). */
export function getTemplates(mode: string): Promise<VtoTemplate[]> {
  return getCatalog(mode);
}

/** Curated, priority-ordered options for a session. */
export async function getOptions(priorities: Priority[], mode: string): Promise<AppearanceOption[]> {
  const templates = await getCatalog(mode);
  const options = buildOptions(templates);
  return orderOptionsByPriority(options, priorities);
}

export function resetTemplateCache(): void {
  cache = null;
}
