/**
 * YouCam Hair Density result-normalization tests (api-feasibility.md §2; §3).
 *
 * Mirrors the Hair Length parser tests: the rest of the app never depends on the
 * provider's raw term strings. This pins the mapping from the documented density
 * terms to our stable enum, including the "extremely low" vs "low" distinction and
 * the safe "unknown" fallback.
 */

import { describe, it, expect } from "vitest";
import { mapHairDensityTerm } from "./hair-density";

describe("mapHairDensityTerm", () => {
  it("maps each documented provider term to the internal enum", () => {
    expect(mapHairDensityTerm("Extremely Low Density")).toBe("extremely_low");
    expect(mapHairDensityTerm("Low Density")).toBe("low");
    expect(mapHairDensityTerm("Medium Density")).toBe("medium");
    expect(mapHairDensityTerm("High Density")).toBe("high");
  });

  it("reads 'extremely low' as extremely_low, never as plain low", () => {
    expect(mapHairDensityTerm("extremely low")).toBe("extremely_low");
    expect(mapHairDensityTerm("Extremely Low Density")).not.toBe("low");
  });

  it("is case- and whitespace-insensitive", () => {
    expect(mapHairDensityTerm("  HIGH DENSITY  ")).toBe("high");
    expect(mapHairDensityTerm("medium density")).toBe("medium");
  });

  it("falls back to unknown for null or unrecognized terms", () => {
    expect(mapHairDensityTerm(null)).toBe("unknown");
    expect(mapHairDensityTerm("")).toBe("unknown");
    expect(mapHairDensityTerm("bald")).toBe("unknown");
  });
});
