/**
 * YouCam Hair Length result-normalization tests (api-feasibility.md §2.1; §3).
 *
 * The whole point of the adapter is that the rest of the app never depends on raw
 * provider strings. This pins the mapping from documented result strings to our
 * stable HairLength enum, including the safe "unknown" fallback.
 */

import { describe, it, expect } from "vitest";
import { mapHairLengthResult } from "./hair-analysis";

describe("mapHairLengthResult", () => {
  it("maps each documented provider string to the internal enum", () => {
    expect(mapHairLengthResult("above the ears")).toBe("above_ear");
    expect(mapHairLengthResult("ear length")).toBe("ear_length");
    expect(mapHairLengthResult("short hair")).toBe("short");
    expect(mapHairLengthResult("above chest")).toBe("medium");
    expect(mapHairLengthResult("long hair")).toBe("long");
  });

  it("is case- and whitespace-insensitive", () => {
    expect(mapHairLengthResult("  LONG HAIR  ")).toBe("long");
    expect(mapHairLengthResult("Short Hair")).toBe("short");
  });

  it("falls back to unknown for null or unrecognized strings", () => {
    expect(mapHairLengthResult(null)).toBe("unknown");
    expect(mapHairLengthResult("")).toBe("unknown");
    expect(mapHairLengthResult("bald")).toBe("unknown");
  });
});
