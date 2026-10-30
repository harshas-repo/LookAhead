/**
 * Appearance-option catalog tests (instruction §5, §7A; api-feasibility.md §4).
 *
 * Every option is now visualizable and bound to a REAL provider template id from
 * one of the four try-on families (hairstyle, extension, bangs, volume) — never
 * invented. The old text-only covering options (wig / scarf / hat / no-covering /
 * keep-current) are gone; extensions play the "covering"/wig role but still render
 * a preview. Per-family caps keep the grid small while browsing stays free.
 */

import { describe, it, expect } from "vitest";
import type { VtoTemplate } from "@/lib/providers/types";
import type { Recommendation } from "./recommend";
import { FAMILY_GROUP_LABEL, buildOptions, optionIdFor, orderOptions, orderOptionsByPriority } from "./options";

const TEMPLATES: VtoTemplate[] = [
  // hairstyle — every female style is surfaced now; mock-buzz is the error demo.
  { templateId: "mock-soft-bob", displayName: "Soft Bob (chin-length)", family: "hairstyle" },
  { templateId: "mock-pixie", displayName: "Pixie Cut", family: "hairstyle" },
  { templateId: "mock-shoulder", displayName: "Shoulder-Length Layers", family: "hairstyle" },
  { templateId: "mock-waves", displayName: "Gentle Waves", family: "hairstyle" },
  { templateId: "mock-extra", displayName: "Extra Style", family: "hairstyle" },
  { templateId: "mock-buzz", displayName: "Buzz Cut (short-source demo)", family: "hairstyle" },
  // extension (cap 3) — carries a provider thumbnail.
  { templateId: "mock-ext-long", displayName: "Long Extension (wig)", family: "extension", imageUrl: "/images/families/extension.png" },
  { templateId: "mock-ext-bob", displayName: "Full Bob (wig)", family: "extension" },
  // bangs (cap 3)
  { templateId: "mock-bang-full", displayName: "Full Bangs", family: "bangs" },
  // volume (cap 2)
  { templateId: "mock-vol-boost", displayName: "Root Volume Boost", family: "volume" }
];

function countFamily(options: ReturnType<typeof buildOptions>, family: string): number {
  return options.filter((o) => o.family === family).length;
}

describe("buildOptions", () => {
  it("binds every option to a real template id from its family", () => {
    const options = buildOptions(TEMPLATES);
    expect(options.length).toBeGreaterThan(0);
    const known = new Set(TEMPLATES.map((t) => t.templateId));
    for (const o of options) {
      expect(o.visualizable).toBe(true);
      expect(o.templateIds).toHaveLength(1);
      expect(known.has(o.templateIds[0])).toBe(true);
      expect(o.id).toBe(optionIdFor(o.family ?? "hairstyle", o.templateIds[0]));
    }
  });

  it("surfaces every hairstyle (all female) and keeps the other families small", () => {
    const options = buildOptions(TEMPLATES);
    expect(countFamily(options, "hairstyle")).toBe(5);
    expect(countFamily(options, "extension")).toBe(2);
    expect(countFamily(options, "bangs")).toBe(1);
    expect(countFamily(options, "volume")).toBe(1);
  });

  it("excludes the mock-buzz error-demo but keeps every other hairstyle", () => {
    const options = buildOptions(TEMPLATES);
    expect(options.some((o) => o.templateIds.includes("mock-buzz"))).toBe(false);
    expect(options.some((o) => o.templateIds.includes("mock-extra"))).toBe(true);
  });

  it("excludes male-presenting templates (by category or id prefix)", () => {
    const withMale: VtoTemplate[] = [
      { templateId: "female_bob", displayName: "Bob", family: "hairstyle", category: "Female" },
      { templateId: "male_short_curly", displayName: "Short Curly", family: "hairstyle", category: "Male" },
      { templateId: "male_fade", displayName: "Fade", family: "hairstyle" }
    ];
    const options = buildOptions(withMale);
    expect(options.map((o) => o.templateIds[0])).toEqual(["female_bob"]);
  });

  it("surfaces the curated distinct bangs first", () => {
    const bangs: VtoTemplate[] = [
      { templateId: "female_thin_bangs", displayName: "Thin Bangs", family: "bangs" },
      { templateId: "female_mini_fringe", displayName: "Mini Fringe", family: "bangs" },
      { templateId: "female_blunt_bangs", displayName: "Blunt Bangs", family: "bangs" },
      { templateId: "female_right_side_swept", displayName: "Right Side Swept", family: "bangs" }
    ];
    const options = buildOptions(bangs).filter((o) => o.family === "bangs");
    expect(options.map((o) => o.templateIds[0])).toEqual([
      "female_blunt_bangs",
      "female_right_side_swept",
      "female_mini_fringe"
    ]);
  });

  it("makes extensions the covering role while keeping them visualizable", () => {
    const options = buildOptions(TEMPLATES);
    const ext = options.find((o) => o.id === "ext_mock-ext-long");
    expect(ext).toBeDefined();
    expect(ext?.category).toBe("covering");
    expect(ext?.visualizable).toBe(true);
    expect(ext?.family).toBe("extension");
  });

  it("classifies hairstyle, bangs and volume options as hairstyle", () => {
    const options = buildOptions(TEMPLATES);
    for (const id of ["style_mock-pixie", "bang_mock-bang-full", "vol_mock-vol-boost"]) {
      expect(options.find((o) => o.id === id)?.category).toBe("hairstyle");
    }
  });

  it("no longer offers the removed text-only covering options", () => {
    const options = buildOptions(TEMPLATES);
    for (const id of ["wig", "scarf", "hat", "no_covering", "keep_current"]) {
      expect(options.some((o) => o.id === id)).toBe(false);
    }
    // And nothing is left that cannot be previewed.
    expect(options.every((o) => o.visualizable)).toBe(true);
  });

  it("carries the provider thumbnail when the template has one", () => {
    const options = buildOptions(TEMPLATES);
    expect(options.find((o) => o.id === "ext_mock-ext-long")?.sampleImageUrl).toBe("/images/families/extension.png");
    expect(options.find((o) => o.id === "ext_mock-ext-bob")?.sampleImageUrl).toBeNull();
  });

  it("returns no options for an empty catalog", () => {
    expect(buildOptions([])).toEqual([]);
  });
});

describe("optionIdFor / FAMILY_GROUP_LABEL", () => {
  it("prefixes ids per family so template ids never collide across families", () => {
    expect(optionIdFor("hairstyle", "t")).toBe("style_t");
    expect(optionIdFor("extension", "t")).toBe("ext_t");
    expect(optionIdFor("bangs", "t")).toBe("bang_t");
    expect(optionIdFor("volume", "t")).toBe("vol_t");
  });

  it("labels every family group for the Rehearse UI", () => {
    expect(FAMILY_GROUP_LABEL.hairstyle).toBe("Hairstyles");
    expect(FAMILY_GROUP_LABEL.extension).toMatch(/wig/i);
    expect(FAMILY_GROUP_LABEL.bangs).toBe("Bangs");
    expect(FAMILY_GROUP_LABEL.volume).toBe("Volume");
  });
});

describe("orderOptionsByPriority", () => {
  const options = buildOptions(TEMPLATES);

  it("does not add or remove options — it only reorders", () => {
    const ordered = orderOptionsByPriority(options, ["comfort"]);
    expect(ordered).toHaveLength(options.length);
    expect(new Set(ordered.map((o) => o.id))).toEqual(new Set(options.map((o) => o.id)));
  });

  it("surfaces extensions (covering) first when comfort/privacy matter", () => {
    const ordered = orderOptionsByPriority(options, ["comfort", "privacy"]);
    expect(ordered[0].category).toBe("covering");
  });

  it("surfaces hairstyle options first when familiar appearance matters", () => {
    const ordered = orderOptionsByPriority(options, ["familiar_appearance"]);
    expect(ordered[0].category).toBe("hairstyle");
  });
});

describe("orderOptions (with a recommendation)", () => {
  const options = buildOptions(TEMPLATES);

  it("lifts highlighted options to the top, in the recommendation's order", () => {
    const recommendation: Recommendation = {
      headline: "A few to try first.",
      highlightedOptionIds: ["vol_mock-vol-boost", "bang_mock-bang-full"],
      reasons: {}
    };
    const ordered = orderOptions(options, [], recommendation);
    expect(ordered[0].id).toBe("vol_mock-vol-boost");
    expect(ordered[1].id).toBe("bang_mock-bang-full");
    expect(ordered).toHaveLength(options.length);
  });

  it("falls back to priority ordering when there is no recommendation", () => {
    const ordered = orderOptions(options, ["comfort"], null);
    expect(ordered).toEqual(orderOptionsByPriority(options, ["comfort"]));
  });
});
