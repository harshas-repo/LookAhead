/**
 * Provider factory.
 *
 * Selects live YouCam adapters only when explicitly configured (PROVIDER_MODE=live
 * + an API key). Otherwise returns clearly-labelled mock adapters so the full
 * journey is demonstrable with zero credits. Callers depend only on the normalized
 * adapter interfaces, so the analysis endpoint can be swapped without app changes.
 */

import { getConfig } from "../config";
import type { TryOnFamily } from "../types";
import {
  MockHairAnalysisAdapter,
  MockHairDensityAdapter,
  MockHairTypeAdapter,
  MockTryOnAdapter
} from "./mock";
import { YouCamHairAnalysisAdapter } from "./youcam/hair-analysis";
import { YouCamHairDensityAdapter } from "./youcam/hair-density";
import { YouCamHairTypeAdapter } from "./youcam/hair-type";
import { YouCamTryOnAdapter } from "./youcam/hairstyle-vto";
import type { HairAnalysisAdapter, HairDensityAdapter, HairstyleVtoAdapter, HairTypeAdapter } from "./types";

export function getHairAnalysisAdapter(): HairAnalysisAdapter {
  const { youcam } = getConfig();
  // Selected analysis endpoint: AI Hair Length Detection (api-feasibility.md §2.1).
  return youcam.liveReady ? new YouCamHairAnalysisAdapter() : new MockHairAnalysisAdapter();
}

/** Hair Density Detection (single, head-lowered photo). */
export function getHairDensityAdapter(): HairDensityAdapter {
  const { youcam } = getConfig();
  return youcam.liveReady ? new YouCamHairDensityAdapter() : new MockHairDensityAdapter();
}

/** Hair Type Detection (three-angle set: front, right, left). */
export function getHairTypeAdapter(): HairTypeAdapter {
  const { youcam } = getConfig();
  return youcam.liveReady ? new YouCamHairTypeAdapter() : new MockHairTypeAdapter();
}

/**
 * Try-on adapter for a given family (hairstyle/extension/bangs/volume). All four
 * share the create + poll contract, so one factory selects live-vs-mock per family.
 */
export function getTryOnAdapter(family: TryOnFamily): HairstyleVtoAdapter {
  const { youcam } = getConfig();
  return youcam.liveReady ? new YouCamTryOnAdapter(family) : new MockTryOnAdapter(family);
}

/** Back-compat: the hairstyle-family try-on adapter existing callers/tests use. */
export function getHairstyleVtoAdapter(): HairstyleVtoAdapter {
  return getTryOnAdapter("hairstyle");
}

/** Whether the app is currently producing simulated (mock) provider results. */
export function isMockMode(): boolean {
  return !getConfig().youcam.liveReady;
}
