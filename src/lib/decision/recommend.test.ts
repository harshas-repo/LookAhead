/**
 * Recommendation tests (instruction §7A — deterministic rules, never an LLM).
 *
 * The recommendation only reorders and annotates options; it never removes choice
 * or predicts anything. These tests pin determinism (same input -> same output) and
 * the headline rules: lower density lifts fuller-looking families, long hair with a
 * near treatment date lifts shorter styles + a wig, priorities steer toward the
 * wig/comfort role, and there is always at least one calm suggestion.
 */

import { describe, it, expect } from "vitest";
import type { AppearanceOption } from "@/lib/types";
import {
  recommend,
  inferStyleAttributes,
  suggestHairstyles,
  buildTimingNote,
  type LookPreference,
  type RecommendInput,
  type SuggestInput
} from "./recommend";

function opt(
  id: string,
  family: NonNullable<AppearanceOption["family"]>,
  category: AppearanceOption["category"] = "hairstyle"
): AppearanceOption {
  return { id, label: id, description: "", visualizable: true, templateIds: [id], family, category };
}

const OPTIONS: AppearanceOption[] = [
  opt("style_a", "hairstyle"),
  opt("style_b", "hairstyle"),
  opt("ext_a", "extension", "covering"),
  opt("ext_b", "extension", "covering"),
  opt("bang_a", "bangs"),
  opt("vol_a", "volume"),
  opt("vol_b", "volume")
];

/** Fixed clock so the "treatment soon" window is deterministic. */
const NOW = Date.parse("2026-01-15T00:00:00.000Z");

function base(overrides: Partial<RecommendInput> = {}): RecommendInput {
  return {
    options: OPTIONS,
    priorities: [],
    topPriorities: [],
    treatmentDate: null,
    length: null,
    density: null,
    type: null,
    now: NOW,
    ...overrides
  };
}

/** An ISO yyyy-mm-dd date `days` from the fixed clock. */
function dateIn(days: number): string {
  return new Date(NOW + days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

describe("recommend", () => {
  it("is deterministic for identical input", () => {
    expect(recommend(base({ density: "low" }))).toEqual(recommend(base({ density: "low" })));
  });

  it("always returns a calm, non-empty headline", () => {
    const r = recommend(base());
    expect(typeof r.headline).toBe("string");
    expect(r.headline.length).toBeGreaterThan(0);
  });

  it("highlights volume + extension when density reads low", () => {
    const r = recommend(base({ density: "low" }));
    expect(r.highlightedOptionIds).toContain("vol_a");
    expect(r.highlightedOptionIds.some((id) => id.startsWith("ext_"))).toBe(true);
    expect(r.headline).toMatch(/density/i);
  });

  it("treats extremely-low density the same way", () => {
    const r = recommend(base({ density: "extremely_low" }));
    expect(r.highlightedOptionIds.some((id) => id.startsWith("vol_"))).toBe(true);
    expect(r.highlightedOptionIds.some((id) => id.startsWith("ext_"))).toBe(true);
  });

  it("highlights shorter styles + a wig for long hair with a near treatment date", () => {
    const r = recommend(base({ length: "long", treatmentDate: dateIn(7) }));
    expect(r.highlightedOptionIds.some((id) => id.startsWith("style_"))).toBe(true);
    expect(r.highlightedOptionIds.some((id) => id.startsWith("ext_"))).toBe(true);
  });

  it("does not treat a distant treatment date as soon", () => {
    const r = recommend(base({ length: "long", treatmentDate: dateIn(120) }));
    // No density/priority signal and not soon -> the default hairstyle suggestion.
    expect(r.highlightedOptionIds.every((id) => id.startsWith("style_"))).toBe(true);
  });

  it("highlights the wig role for privacy/comfort priorities", () => {
    const r = recommend(base({ topPriorities: ["privacy"] }));
    expect(r.highlightedOptionIds.length).toBeGreaterThan(0);
    expect(r.highlightedOptionIds.every((id) => id.startsWith("ext_"))).toBe(true);
  });

  it("uses priorities when topPriorities is empty", () => {
    const r = recommend(base({ priorities: ["comfort"], topPriorities: [] }));
    expect(r.highlightedOptionIds.every((id) => id.startsWith("ext_"))).toBe(true);
  });

  it("highlights familiar looks (hairstyle + matching wig) for familiar_appearance", () => {
    const r = recommend(base({ topPriorities: ["familiar_appearance"] }));
    expect(r.highlightedOptionIds.some((id) => id.startsWith("style_"))).toBe(true);
    expect(r.highlightedOptionIds.some((id) => id.startsWith("ext_"))).toBe(true);
  });

  it("falls back to a hairstyle suggestion when there is no signal", () => {
    const r = recommend(base());
    expect(r.highlightedOptionIds.length).toBeGreaterThan(0);
    expect(r.highlightedOptionIds.every((id) => id.startsWith("style_"))).toBe(true);
  });

  it("never highlights more than four options", () => {
    const r = recommend(base({ density: "low", topPriorities: ["familiar_appearance"] }));
    expect(r.highlightedOptionIds.length).toBeLessThanOrEqual(4);
  });

  it("gives every highlighted option a reason", () => {
    const r = recommend(base({ density: "low" }));
    for (const id of r.highlightedOptionIds) {
      expect(typeof r.reasons[id]).toBe("string");
      expect(r.reasons[id].length).toBeGreaterThan(0);
    }
  });

  it("highlights nothing when there are no options to choose from", () => {
    const r = recommend(base({ options: [] }));
    expect(r.highlightedOptionIds).toEqual([]);
  });
});

/* ── Opt-in suggested looks ────────────────────────────────────────────── */

/** A female hairstyle option with a descriptive catalog title (the only signal). */
function style(id: string, label: string): AppearanceOption {
  return {
    id,
    label,
    description: "",
    visualizable: true,
    templateIds: [id],
    family: "hairstyle",
    category: "hairstyle",
    sampleImageUrl: `https://cdn.example/${id}.png`
  };
}

const STYLES: AppearanceOption[] = [
  style("s_long_straight", "Long Sleek Straight"),
  style("s_long_wave", "Long Wavy Layers"),
  style("s_short_bob", "Chin-Length Blunt Bob"),
  style("s_short_pixie", "Pixie Crop"),
  style("s_curly_bounce", "Bouncy Curly Long"),
  style("s_crimp", "Retro Crimped Long"),
  style("s_updo", "Braided Bun Updo")
];

function suggest(overrides: Partial<SuggestInput> = {}): SuggestInput {
  return {
    options: STYLES,
    preference: "original",
    length: null,
    density: null,
    type: null,
    treatmentDate: null,
    ...overrides
  };
}

describe("inferStyleAttributes", () => {
  it("reads length + texture from catalog titles", () => {
    expect(inferStyleAttributes("Long Wavy Layers")).toEqual({ length: "long", texture: "wavy" });
    expect(inferStyleAttributes("Chin-Length Blunt Bob")).toEqual({ length: "short", texture: "straight" });
    expect(inferStyleAttributes("Pixie Crop")).toEqual({ length: "short", texture: "unknown" });
    expect(inferStyleAttributes("Bouncy Curly Long")).toEqual({ length: "long", texture: "curly" });
  });

  it("returns unknown when the title carries no clue", () => {
    expect(inferStyleAttributes("Something Generic")).toEqual({ length: "unknown", texture: "unknown" });
  });
});

describe("suggestHairstyles", () => {
  it("is deterministic for identical input", () => {
    const a = suggestHairstyles(suggest({ preference: "distinct", length: "long", type: "Straight" }));
    const b = suggestHairstyles(suggest({ preference: "distinct", length: "long", type: "Straight" }));
    expect(a).toEqual(b);
  });

  it("returns at most three hairstyle-only ideas", () => {
    const r = suggestHairstyles(suggest({ options: [...STYLES, opt("ext_a", "extension", "covering")] }));
    expect(r.items.length).toBeLessThanOrEqual(3);
    expect(r.items.every((i) => i.optionId.startsWith("s_"))).toBe(true);
  });

  it("'original' prefers styles matching the record length", () => {
    const r = suggestHairstyles(suggest({ preference: "original", length: "long" }));
    const ids = r.items.map((i) => i.optionId);
    expect(ids.every((id) => inferStyleAttributes(STYLES.find((s) => s.id === id)!.label).length === "long")).toBe(true);
  });

  it("'distinct' contrasts a long, straight record with shorter/textured picks", () => {
    const r = suggestHairstyles(suggest({ preference: "distinct", length: "long", type: "Straight" }));
    const attrs = r.items.map((i) => inferStyleAttributes(STYLES.find((s) => s.id === i.optionId)!.label));
    // At least one pick breaks from the long+straight record.
    expect(attrs.some((a) => a.length !== "long" || (a.texture !== "straight" && a.texture !== "unknown"))).toBe(true);
  });

  it("low density lifts fuller textures into the picks", () => {
    const withLow = suggestHairstyles(suggest({ preference: "distinct", density: "low" }));
    const labels = withLow.items.map((i) => i.label.toLowerCase());
    expect(labels.some((l) => l.includes("wave") || l.includes("curl") || l.includes("crimp"))).toBe(true);
  });

  it("mentions density in the considerations when density reads low", () => {
    const r = suggestHairstyles(suggest({ preference: "original", density: "extremely_low" }));
    expect(r.considerations.some((c) => /density|fuller/i.test(c))).toBe(true);
  });

  it("stays honest — framed as ideas, never a promise of the outcome", () => {
    const r = suggestHairstyles(suggest({ preference: "slightly_different", length: "medium" }));
    const blob = `${r.headline} ${r.considerations.join(" ")}`.toLowerCase();
    expect(blob).toMatch(/idea|consider/);
    // It disclaims prediction rather than promising an exact outcome.
    expect(blob).toMatch(/not a prediction|never a prediction/);
    expect(blob).not.toMatch(/guarantee|exactly how you will look|promise/);
  });

  it("is safe with an empty record (preference-only scoring + add-photos note)", () => {
    const r = suggestHairstyles(suggest({ preference: "original" }));
    expect(r.items.length).toBeGreaterThan(0);
    expect(r.considerations.some((c) => /add photos|prepare/i.test(c))).toBe(true);
  });

  it("returns an empty result when there are no hairstyle options", () => {
    const r = suggestHairstyles(suggest({ options: [opt("ext_a", "extension", "covering")], preference: "original" }));
    expect(r.items).toEqual([]);
    expect(typeof r.headline).toBe("string");
  });

  it("covers every preference without throwing", () => {
    const prefs: LookPreference[] = ["original", "slightly_different", "distinct"];
    for (const p of prefs) {
      const r = suggestHairstyles(suggest({ preference: p, length: "short", type: "Wavy" }));
      expect(Array.isArray(r.items)).toBe(true);
      expect(r.mixes.length).toBeGreaterThan(0);
    }
  });
});

/* ── Treatment-timing note ────────────────────────────────────────────────
 * A small, honest contextual line driven only by how far the treatment date is
 * from `now`. Never a medical prediction. Buckets: future >14d, future <=14d,
 * 0-14d since start, 15-60d, 61-150d, >150d. */

describe("buildTimingNote", () => {
  it("returns null when there is no treatment date", () => {
    expect(buildTimingNote(null, NOW)).toBeNull();
  });

  it("returns null for an unparseable date", () => {
    expect(buildTimingNote("not-a-date", NOW)).toBeNull();
  });

  it("reads a distant future date as still time to explore", () => {
    expect(buildTimingNote(dateIn(30), NOW)).toMatch(/little way off/i);
  });

  it("reads a near start date as a good time to have a plan", () => {
    expect(buildTimingNote(dateIn(7), NOW)).toMatch(/start date close/i);
  });

  it("treats the boundary day (14d out) as near, not distant", () => {
    expect(buildTimingNote(dateIn(14), NOW)).toMatch(/start date close/i);
  });

  it("reads just-started (0-14 days in)", () => {
    expect(buildTimingNote(dateIn(-5), NOW)).toMatch(/just started/i);
  });

  it("reads a few weeks in (15-60 days)", () => {
    expect(buildTimingNote(dateIn(-30), NOW)).toMatch(/few weeks in/i);
  });

  it("reads a few months in (61-150 days)", () => {
    expect(buildTimingNote(dateIn(-90), NOW)).toMatch(/few months in/i);
  });

  it("reads well into the journey (150+ days)", () => {
    expect(buildTimingNote(dateIn(-200), NOW)).toMatch(/well into your journey/i);
  });

  it("is deterministic and never predicts an outcome", () => {
    const a = buildTimingNote(dateIn(-30), NOW);
    expect(a).toBe(buildTimingNote(dateIn(-30), NOW));
    expect((a ?? "").toLowerCase()).not.toMatch(/guarantee|predict|will lose|go bald/);
  });
});

describe("suggestHairstyles — timing note", () => {
  it("sets timingNote from the treatment date", () => {
    const r = suggestHairstyles(suggest({ preference: "original", treatmentDate: dateIn(7), now: NOW }));
    expect(r.timingNote).toMatch(/start date close/i);
  });

  it("has no timingNote without a treatment date", () => {
    const r = suggestHairstyles(suggest({ preference: "original", now: NOW }));
    expect(r.timingNote).toBeNull();
  });
});
