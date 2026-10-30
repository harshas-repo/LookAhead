/**
 * Guide tests.
 *
 * The guide is fully deterministic — no LLM, no network, no credentials. It runs
 * one turn of the decision-support loop and returns a stable, valid shape. It must
 * never invent options, never emit an unknown action, and always echo the engine's
 * recommended stage.
 */

import { describe, it, expect } from "vitest";
import { newSession } from "@/lib/store";
import type { AppearanceOption, Session, Stage } from "@/lib/types";
import { KNOWN_ACTIONS, buildGuide, type GuideContext } from "./index";

const OPTIONS: AppearanceOption[] = [
  { id: "wig", label: "Wig", description: "", visualizable: false, templateIds: [], category: "covering" },
  { id: "scarf", label: "Scarf or head wrap", description: "", visualizable: false, templateIds: [], category: "covering" },
  { id: "style_pixie", label: "Pixie Cut", description: "", visualizable: true, templateIds: ["tpl-pixie"], category: "hairstyle" }
];

const PREVIEW_CHOICES = ["Yes, show me a preview", "Not right now"];

function ctx(stage: Stage, session: Session = newSession()): GuideContext {
  return { session, options: OPTIONS, recommendedStage: stage };
}

describe("buildGuide (deterministic)", () => {
  it("emits a known nextAction for every guided stage", () => {
    const stages: Stage[] = [
      "PROFILE",
      "PHOTO_CAPTURE",
      "HAIR_ANALYSIS",
      "PREPARATION",
      "OPTION_EXPLORATION",
      "PLAN_A",
      "SCENARIO_REHEARSAL",
      "PLAN_B",
      "PLAN_REVIEW",
      "COMPLETE"
    ];
    for (const stage of stages) {
      const g = buildGuide(ctx(stage));
      expect(KNOWN_ACTIONS).toContain(g.nextAction);
      expect(typeof g.message).toBe("string");
      expect(g.message.length).toBeGreaterThan(0);
    }
  });

  it("echoes the engine's recommended stage unchanged (guide never overrides it)", () => {
    expect(buildGuide(ctx("PLAN_B")).recommendedStage).toBe("PLAN_B");
  });

  it("never invents options: presented choices come from the real catalog", () => {
    const g = buildGuide(ctx("OPTION_EXPLORATION"));
    const labels = new Set(OPTIONS.map((o) => o.label));
    for (const c of g.choices) {
      expect(labels.has(c) || PREVIEW_CHOICES.includes(c)).toBe(true);
    }
  });

  it("caps choices at six and removes duplicates/blanks", () => {
    const g = buildGuide(ctx("PLAN_A"));
    expect(g.choices.length).toBeLessThanOrEqual(6);
    expect(new Set(g.choices).size).toBe(g.choices.length);
  });

  it("carries a validated action and an explicit approval flag", () => {
    const g = buildGuide(ctx("OPTION_EXPLORATION"));
    expect(typeof g.action.type).toBe("string");
    expect(typeof g.requiresApproval).toBe("boolean");
  });

  it("is deterministic: the same state always yields the same guidance", () => {
    const session = newSession();
    expect(buildGuide(ctx("PLAN_A", session))).toEqual(buildGuide(ctx("PLAN_A", session)));
  });
});
