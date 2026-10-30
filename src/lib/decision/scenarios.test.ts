/**
 * Scenario library tests (instruction §7C; tech-implementation.md §6).
 *
 * Scenarios are planning exercises, not medical predictions. The two guarantees we
 * lock down here: scenario selection is deterministic and relevant to Plan A, and
 * every scenario ALWAYS offers an explicit "leave undecided" path so the user is
 * never forced to commit.
 */

import { describe, it, expect } from "vitest";
import type { AppearanceOption, PlanEntry } from "@/lib/types";
import { QUESTION_BANK, SCENARIOS, buildScenarioChoices, selectScenario } from "./scenarios";

function planA(optionId: string, label = optionId): PlanEntry {
  return { label, optionId, previewId: null, rationale: null };
}

const OPTIONS: AppearanceOption[] = [
  { id: "ext_mock-ext-long", label: "Long Extension (wig)", description: "", visualizable: true, templateIds: ["mock-ext-long"], family: "extension", category: "covering" },
  { id: "style_mock-pixie", label: "Pixie Cut", description: "", visualizable: true, templateIds: ["mock-pixie"], family: "hairstyle", category: "hairstyle" },
  { id: "bang_mock-bang-full", label: "Full Bangs", description: "", visualizable: true, templateIds: ["mock-bang-full"], family: "bangs", category: "hairstyle" },
  { id: "vol_mock-vol-boost", label: "Root Volume Boost", description: "", visualizable: true, templateIds: ["mock-vol-boost"], family: "volume", category: "hairstyle" }
];

describe("selectScenario", () => {
  it("returns a covering-relevant scenario for an extension (covering) Plan A", () => {
    const s = selectScenario(planA("ext_mock-ext-long"), new Set());
    expect(s.appliesTo.length === 0 || s.appliesTo.includes("covering")).toBe(true);
  });

  it("routes an extension Plan A to the covering-only scenario once the general one is used", () => {
    const s = selectScenario(planA("ext_mock-ext-long"), new Set(["uncomfortable"]));
    expect(s.id).toBe("change_mind_covering");
  });

  it("routes a hairstyle Plan A away from the covering-only scenario", () => {
    const s = selectScenario(planA("style_mock-pixie"), new Set(["uncomfortable"]));
    expect(s.id).toBe("unavailable");
  });

  it("falls back to the first scenario when the option id has no known family prefix", () => {
    const s = selectScenario(planA("legacy_wig"), new Set());
    expect(s.id).toBe("uncomfortable");
  });

  it("is deterministic for the same inputs", () => {
    const a = selectScenario(planA("ext_mock-ext-long"), new Set());
    const b = selectScenario(planA("ext_mock-ext-long"), new Set());
    expect(a.id).toBe(b.id);
  });

  it("skips scenarios the user has already used", () => {
    const first = selectScenario(null, new Set());
    const second = selectScenario(null, new Set([first.id]));
    expect(second.id).not.toBe(first.id);
  });

  it("falls back gracefully when every scenario has been used", () => {
    const all = new Set(SCENARIOS.map((s) => s.id));
    const s = selectScenario(null, all);
    expect(SCENARIOS.map((x) => x.id)).toContain(s.id);
  });

  it("works with no Plan A at all", () => {
    expect(() => selectScenario(null, new Set())).not.toThrow();
  });
});

describe("buildScenarioChoices", () => {
  it("ALWAYS includes an explicit undecided path", () => {
    const choices = buildScenarioChoices(OPTIONS, planA("ext_mock-ext-long"));
    expect(choices).toContain("Leave this undecided for now");
  });

  it("includes the undecided path even with no Plan A and no options", () => {
    const choices = buildScenarioChoices([], null);
    expect(choices).toEqual(["Leave this undecided for now"]);
  });

  it("excludes the user's Plan A from the alternatives", () => {
    const choices = buildScenarioChoices(OPTIONS, planA("ext_mock-ext-long", "Long Extension (wig)"));
    expect(choices).not.toContain("Long Extension (wig)");
  });

  it("keeps the alternative list short", () => {
    const choices = buildScenarioChoices(OPTIONS, null);
    // up to 4 alternatives plus the undecided path
    expect(choices.length).toBeLessThanOrEqual(5);
  });
});

describe("QUESTION_BANK", () => {
  it("provides a deterministic prompt for every guided stage", () => {
    for (const stage of ["PROFILE", "PHOTO_CAPTURE", "OPTION_EXPLORATION", "PLAN_A", "PLAN_B", "COMPLETE"]) {
      expect(QUESTION_BANK[stage], `missing bank entry for ${stage}`).toBeDefined();
      expect(typeof QUESTION_BANK[stage].message).toBe("string");
      expect(typeof QUESTION_BANK[stage].nextAction).toBe("string");
    }
  });

  it("ends the journey with no further question at COMPLETE", () => {
    expect(QUESTION_BANK.COMPLETE.question).toBeNull();
    expect(QUESTION_BANK.COMPLETE.nextAction).toBe("finish");
  });
});
