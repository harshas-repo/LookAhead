/**
 * YouCam Hair Type result-parsing tests (api-feasibility.md §2; §3).
 *
 * Hair Type returns `results.hair_type.{ mapping, term }`. The adapter's job is to
 * read that shape defensively so the app never depends on the raw provider object:
 * a well-formed result yields both strings, and anything missing or mistyped degrades
 * to nulls rather than throwing.
 */

import { describe, it, expect } from "vitest";
import { readHairType } from "./hair-type";

describe("readHairType", () => {
  it("reads mapping + term from the documented results shape", () => {
    expect(readHairType({ hair_type: { mapping: "1 to 2a", term: "Straight to Slight Wavy" } })).toEqual({
      mapping: "1 to 2a",
      term: "Straight to Slight Wavy"
    });
  });

  it("returns nulls when results are missing or empty", () => {
    expect(readHairType(undefined)).toEqual({ mapping: null, term: null });
    expect(readHairType({})).toEqual({ mapping: null, term: null });
  });

  it("ignores non-string fields", () => {
    expect(readHairType({ hair_type: { mapping: 5, term: null } })).toEqual({ mapping: null, term: null });
  });

  it("ignores a hair_type that is not an object", () => {
    expect(readHairType({ hair_type: "2b" })).toEqual({ mapping: null, term: null });
  });

  it("keeps a partial result (a term without a mapping)", () => {
    expect(readHairType({ hair_type: { term: "Medium Wavy" } })).toEqual({ mapping: null, term: "Medium Wavy" });
  });
});
