/**
 * Decision-engine tests (instruction §7A, §17).
 *
 * The engine is the deterministic source of truth: the guide sits on top of
 * it and can never override these rules. These tests pin the state machine,
 * completion conditions, transition guards, and — critically — that the plan
 * distinguishes API-detected hair info from user-corrected hair info.
 */

import { describe, it, expect } from "vitest";
import { newSession } from "@/lib/store";
import type { HairAnalysisResult, HairDensityResult, HairTypeResult, Preview, Session, Stage } from "@/lib/types";
import {
  STAGE_ORDER,
  assemblePlan,
  hairLengthLabel,
  isStageComplete,
  isValidTransition,
  stageIndex,
  suggestNextStage
} from "./engine";

function analysis(overrides: Partial<HairAnalysisResult> = {}): HairAnalysisResult {
  return {
    provider: "mock-hair-length",
    length: "medium",
    rawResult: "above chest (simulated)",
    userCorrection: null,
    status: "success",
    errorCode: null,
    analyzedAt: new Date().toISOString(),
    ...overrides
  };
}

function density(overrides: Partial<HairDensityResult> = {}): HairDensityResult {
  return {
    provider: "mock-hair-density",
    term: "medium",
    rawResult: "Medium Density (simulated)",
    status: "success",
    errorCode: null,
    analyzedAt: new Date().toISOString(),
    ...overrides
  };
}

function hairType(overrides: Partial<HairTypeResult> = {}): HairTypeResult {
  return {
    provider: "mock-hair-type",
    mapping: "1 to 2a",
    term: "Straight to Slight Wavy",
    status: "success",
    errorCode: null,
    analyzedAt: new Date().toISOString(),
    ...overrides
  };
}

function preview(overrides: Partial<Preview> = {}): Preview {
  return {
    id: "prev_1",
    templateId: "mock-soft-bob",
    displayName: "Soft Bob (chin-length)",
    family: "hairstyle",
    inputPhotoRefId: "photo_1",
    taskId: "task_1",
    outputImageRef: "photos/out_prev_1.svg",
    status: "success",
    errorCode: null,
    charged: true,
    createdAt: new Date().toISOString(),
    ...overrides
  };
}

describe("stageIndex / STAGE_ORDER", () => {
  it("orders the journey linearly from START to COMPLETE", () => {
    expect(STAGE_ORDER[0]).toBe("START");
    expect(STAGE_ORDER[STAGE_ORDER.length - 1]).toBe("COMPLETE");
    expect(stageIndex("PLAN_A")).toBeLessThan(stageIndex("PLAN_B"));
    expect(stageIndex("NOT_A_STAGE" as Stage)).toBe(-1);
  });
});

describe("isStageComplete", () => {
  it("requires at least one priority for PROFILE", () => {
    const s = newSession();
    expect(isStageComplete(s, "PROFILE")).toBe(false);
    s.profile.priorities = ["comfort"];
    expect(isStageComplete(s, "PROFILE")).toBe(true);
  });

  it("requires a photo for PHOTO_CAPTURE", () => {
    const s = newSession();
    expect(isStageComplete(s, "PHOTO_CAPTURE")).toBe(false);
    s.hairRecord.photoRef = { id: "photo_1", storedPath: "photos/p.jpg", width: 10, height: 10, createdAt: "" };
    expect(isStageComplete(s, "PHOTO_CAPTURE")).toBe(true);
  });

  it("treats success, failed and skipped analyses as settled for HAIR_ANALYSIS", () => {
    const s = newSession();
    expect(isStageComplete(s, "HAIR_ANALYSIS")).toBe(false);
    s.hairRecord.analysis = analysis({ status: "success" });
    expect(isStageComplete(s, "HAIR_ANALYSIS")).toBe(true);
    s.hairRecord.analysis = analysis({ status: "failed", errorCode: "error_hair_too_short" });
    expect(isStageComplete(s, "HAIR_ANALYSIS")).toBe(true);
    s.hairRecord.analysis = analysis({ status: "skipped" });
    expect(isStageComplete(s, "HAIR_ANALYSIS")).toBe(true);
    s.hairRecord.analysis = analysis({ status: "pending" });
    expect(isStageComplete(s, "HAIR_ANALYSIS")).toBe(false);
  });

  it("accepts either a preview or an option decision for OPTION_EXPLORATION", () => {
    const s = newSession();
    expect(isStageComplete(s, "OPTION_EXPLORATION")).toBe(false);
    s.previews = [preview()];
    expect(isStageComplete(s, "OPTION_EXPLORATION")).toBe(true);
  });

  it("PREPARATION never blocks progress", () => {
    expect(isStageComplete(newSession(), "PREPARATION")).toBe(true);
  });
});

describe("isValidTransition", () => {
  it("always allows moving back to re-edit or skip", () => {
    const s = newSession();
    s.currentStage = "PLAN_B";
    expect(isValidTransition(s, "PROFILE")).toBe(true);
    expect(isValidTransition(s, "OPTION_EXPLORATION")).toBe(true);
  });

  it("allows a single step forward", () => {
    const s = newSession();
    s.currentStage = "PROFILE";
    expect(isValidTransition(s, "PHOTO_CAPTURE")).toBe(true);
  });

  it("blocks a large forward jump when prerequisites are missing", () => {
    const s = newSession();
    s.currentStage = "START";
    // No priorities, no photo, no plan A — cannot leap to PLAN_REVIEW.
    expect(isValidTransition(s, "PLAN_REVIEW")).toBe(false);
  });

  it("allows a large forward jump once every prerequisite is satisfied", () => {
    const s = newSession();
    s.currentStage = "START";
    s.profile.priorities = ["comfort"];
    s.hairRecord.photoRef = { id: "p", storedPath: "photos/p.jpg", width: 1, height: 1, createdAt: "" };
    s.hairRecord.analysis = analysis({ status: "skipped" });
    s.previews = [preview()]; // satisfies OPTION_EXPLORATION
    s.plan.planA = { label: "Wig", optionId: "wig", previewId: null, rationale: null };
    s.decisions = [
      {
        id: "d1",
        questionId: "scenario_uncomfortable",
        prompt: "q",
        selectedOption: "Scarf",
        isResolved: true,
        note: null,
        answeredAt: ""
      }
    ]; // satisfies SCENARIO_REHEARSAL
    s.plan.planB = { label: "Scarf", optionId: "scarf", previewId: null, rationale: null };
    expect(isValidTransition(s, "PLAN_REVIEW")).toBe(true);
  });

  it("rejects unknown stages", () => {
    expect(isValidTransition(newSession(), "NOT_A_STAGE" as Stage)).toBe(false);
  });
});

describe("suggestNextStage", () => {
  it("points at the first incomplete stage after the current one", () => {
    const s = newSession();
    s.currentStage = "START";
    expect(suggestNextStage(s)).toBe("PROFILE");
  });

  it("returns COMPLETE when nothing is outstanding", () => {
    const s: Session = newSession();
    s.currentStage = "PLAN_REVIEW";
    expect(suggestNextStage(s)).toBe("COMPLETE");
  });
});

describe("hairLengthLabel", () => {
  it("maps categories to warm, non-clinical copy and handles missing values", () => {
    expect(hairLengthLabel("long")).toBe("Long");
    expect(hairLengthLabel("medium")).toContain("collarbone");
    expect(hairLengthLabel(null)).toBe("Not detected");
    expect(hairLengthLabel(undefined)).toBe("Not detected");
  });
});

describe("assemblePlan", () => {
  it("reports API-detected hair info with source 'api'", () => {
    const s = newSession();
    s.hairRecord.analysis = analysis({ length: "long", userCorrection: null });
    const plan = assemblePlan(s, "mock");
    expect(plan.hairRecord?.detected).toBe("Long");
    expect(plan.hairRecord?.userCorrected).toBeNull();
    expect(plan.hairRecord?.finalLabel).toBe("Long");
    expect(plan.hairRecord?.source).toBe("api");
    expect(plan.hairRecord?.providerMode).toBe("mock");
  });

  it("prefers the user correction and marks source 'user' (detected vs corrected)", () => {
    const s = newSession();
    s.hairRecord.analysis = analysis({ length: "long", userCorrection: "short" });
    const plan = assemblePlan(s, "live");
    expect(plan.hairRecord?.detected).toBe("Long");
    expect(plan.hairRecord?.userCorrected).toBe("Short");
    expect(plan.hairRecord?.finalLabel).toBe("Short");
    expect(plan.hairRecord?.source).toBe("user");
    expect(plan.hairRecord?.providerMode).toBe("live");
  });

  it("returns a null hairRecord when no analysis exists", () => {
    const plan = assemblePlan(newSession(), "mock");
    expect(plan.hairRecord).toBeNull();
  });

  it("never invents content: only real choices and unresolved decisions surface", () => {
    const s = newSession();
    s.plan.planA = { label: "Wig", optionId: "wig", previewId: "prev_1", rationale: null };
    s.previews = [preview({ id: "prev_1" })];
    s.plan.questionsForCareTeam = ["How soon before treatment should I cut my hair?"];
    s.decisions = [
      {
        id: "d1",
        questionId: "scenario_uncomfortable",
        prompt: "q",
        selectedOption: null,
        isResolved: false,
        note: null,
        answeredAt: ""
      }
    ];
    const plan = assemblePlan(s, "mock");
    expect(plan.planA?.label).toBe("Wig");
    expect(plan.planA?.preview?.id).toBe("prev_1");
    expect(plan.planB).toBeNull();
    expect(plan.questionsForCareTeam).toHaveLength(1);
    expect(plan.unresolved).toHaveLength(1);
    expect(plan.previewCount).toBe(1);
  });

  it("counts only successful previews", () => {
    const s = newSession();
    s.previews = [preview({ id: "a", status: "success" }), preview({ id: "b", status: "failed" })];
    expect(assemblePlan(s, "mock").previewCount).toBe(1);
  });

  it("composes the hair-record sentence with bold detected values", () => {
    const s = newSession();
    s.hairRecord.analysis = analysis({ length: "long", userCorrection: null });
    s.hairRecord.density = density({ term: "low" });
    s.hairRecord.type = hairType({ term: "Straight to Slight Wavy" });
    const plan = assemblePlan(s, "mock");
    expect(plan.hairRecord?.sentence).toMatch(/never a prediction/i);
    expect(plan.hairRecord?.segments.some((seg) => seg.bold)).toBe(true);
    expect(plan.hairRecord?.sentence.toLowerCase()).toContain("straight to slight wavy");
  });

  it("builds a hair record from density/type even without a length analysis", () => {
    const s = newSession();
    s.hairRecord.density = density({ term: "high" });
    const plan = assemblePlan(s, "mock");
    expect(plan.hairRecord).not.toBeNull();
    expect(plan.hairRecord?.finalLabel).toBe("Not recorded");
    expect(plan.hairRecord?.sentence).toMatch(/never a prediction/i);
  });

  it("carries the chosen option id and representative image onto the plan", () => {
    const s = newSession();
    s.plan.planA = {
      label: "Long Extension (wig)",
      optionId: "ext_mock-ext-long",
      previewId: null,
      imageUrl: "/images/families/extension.png",
      family: "extension",
      rationale: null
    };
    const plan = assemblePlan(s, "mock");
    expect(plan.planA?.optionId).toBe("ext_mock-ext-long");
    expect(plan.planA?.imageUrl).toBe("/images/families/extension.png");
    expect(plan.planA?.preview).toBeNull();
  });
});
