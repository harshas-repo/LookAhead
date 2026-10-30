/**
 * Validation + label tests (instruction §5, §7B, §11).
 *
 * Two things matter here: the constrained schemas that keep malformed or oversized
 * payloads away from providers, and the plain-language copy that makes
 * `error_hair_too_short` a first-class, reassuring user flow rather than a generic
 * failure.
 */

import { describe, it, expect } from "vitest";
import {
  decisionSchema,
  guideResponseSchema,
  hairAnalysisRequestSchema,
  photoMetaSchema,
  planEntrySchema,
  previewRequestSchema,
  updateProfileSchema
} from "@/lib/validation";
import { ERROR_COPY, describeError, priorityLabel } from "@/lib/labels";

describe("validation schemas", () => {
  it("rejects unknown priorities and too many topPriorities", () => {
    expect(updateProfileSchema.safeParse({ priorities: ["not_a_priority"] }).success).toBe(false);
    expect(updateProfileSchema.safeParse({ topPriorities: ["comfort", "privacy", "cost"] }).success).toBe(false);
    expect(updateProfileSchema.safeParse({ topPriorities: ["comfort", "privacy"] }).success).toBe(true);
  });

  it("requires an ISO yyyy-mm-dd treatment date", () => {
    expect(updateProfileSchema.safeParse({ optionalTreatmentDate: "2026-01-15" }).success).toBe(true);
    expect(updateProfileSchema.safeParse({ optionalTreatmentDate: "15/01/2026" }).success).toBe(false);
  });

  it("rejects non-positive or oversized photo metadata", () => {
    expect(photoMetaSchema.safeParse({ width: 0, height: 10, sizeBytes: 10 }).success).toBe(false);
    expect(photoMetaSchema.safeParse({ width: 10, height: 10, sizeBytes: 11 * 1024 * 1024 }).success).toBe(false);
    expect(photoMetaSchema.safeParse({ width: 800, height: 1000, sizeBytes: 200_000 }).success).toBe(true);
  });

  it("requires both a template and a photo for a preview request", () => {
    expect(previewRequestSchema.safeParse({ templateId: "", photoRefId: "p" }).success).toBe(false);
    expect(previewRequestSchema.safeParse({ templateId: "t", photoRefId: "p" }).success).toBe(true);
  });

  it("requires a prompt and resolution flag for decisions", () => {
    expect(decisionSchema.safeParse({ questionId: "q", prompt: "", isResolved: true }).success).toBe(false);
    expect(decisionSchema.safeParse({ questionId: "q", prompt: "p", isResolved: false }).success).toBe(true);
  });

  it("allows a plan entry to be created with just a label", () => {
    expect(planEntrySchema.safeParse({ label: "Wig" }).success).toBe(true);
    expect(planEntrySchema.safeParse({ label: "" }).success).toBe(false);
  });

  it("accepts a representative imageUrl and a known family on a plan entry", () => {
    expect(
      planEntrySchema.safeParse({ label: "Long Extension", imageUrl: "/images/families/extension.png", family: "extension" })
        .success
    ).toBe(true);
    expect(planEntrySchema.safeParse({ label: "X", imageUrl: null }).success).toBe(true);
    expect(planEntrySchema.safeParse({ label: "X", family: "not_a_family" }).success).toBe(false);
  });

  it("makes photoRefId optional so a re-analysis can run without naming a photo", () => {
    expect(hairAnalysisRequestSchema.safeParse({}).success).toBe(true);
    expect(hairAnalysisRequestSchema.safeParse({ photoRefId: "photo_1" }).success).toBe(true);
    expect(hairAnalysisRequestSchema.safeParse({ photoRefId: "" }).success).toBe(false);
  });
});

describe("guideResponseSchema (guide response contract)", () => {
  it("accepts a well-formed guide response", () => {
    const res = guideResponseSchema.safeParse({
      message: "A gentle next step.",
      question: "What feels right?",
      choices: ["Wig", "Scarf"],
      nextAction: "select_plan_a"
    });
    expect(res.success).toBe(true);
  });

  it("rejects more than six choices", () => {
    const res = guideResponseSchema.safeParse({
      message: "m",
      question: null,
      choices: ["a", "b", "c", "d", "e", "f", "g"],
      nextAction: "finish"
    });
    expect(res.success).toBe(false);
  });

  it("rejects a missing/incorrectly-typed question field", () => {
    expect(guideResponseSchema.safeParse({ message: "m", choices: [], nextAction: "finish" }).success).toBe(false);
    expect(guideResponseSchema.safeParse({ message: "m", question: 5, choices: [], nextAction: "finish" }).success).toBe(false);
  });
});

describe("labels / error copy", () => {
  it("treats error_hair_too_short as a first-class, reassuring flow", () => {
    expect(ERROR_COPY.error_hair_too_short).toBeDefined();
    const copy = describeError("error_hair_too_short");
    expect(copy.title).toMatch(/length/i);
    // It must reassure the user and offer a path forward, not blame the photo.
    expect(copy.body).toMatch(/isn't a problem with your photo/i);
    expect(copy.body).toMatch(/covering options/i);
  });

  it("provides specific copy for face-detection errors", () => {
    expect(describeError("error_no_face_detected").title).toMatch(/face/i);
    expect(describeError("error_multiple_faces").title).toMatch(/more than one face/i);
  });

  it("falls back to calm, generic copy for unknown codes without blaming the user", () => {
    const copy = describeError("something_unexpected");
    expect(copy.title).toMatch(/didn't go through/i);
    expect(copy.body).toMatch(/aren't retried automatically/i);
    expect(describeError(null).title).toMatch(/didn't go through/i);
  });

  it("maps priorities to warm labels", () => {
    expect(priorityLabel("familiar_appearance")).toBe("Looking like myself");
    expect(priorityLabel("control_timing")).toMatch(/Control/i);
  });
});
