/**
 * Preview-limit tests (instruction §6).
 *
 * These lock down the server-enforced invariants that must never be left to the
 * client: the per-session budget (unlimited by default via max=0, a hard ceiling
 * when positive), reuse of an identical SUCCESSFUL preview instead of
 * re-charging, and no automatic retry of failures.
 */

import { describe, it, expect } from "vitest";
import { newSession } from "@/lib/store";
import type { Preview } from "@/lib/types";
import { checkPreviewBudget, findInFlightPreview, findReusablePreview, remainingPreviews } from "./limits";

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

describe("checkPreviewBudget", () => {
  it("allows attempts while under the limit", () => {
    expect(checkPreviewBudget(0, 3).allowed).toBe(true);
    expect(checkPreviewBudget(2, 3).allowed).toBe(true);
  });

  it("blocks the attempt that would exceed the limit", () => {
    const res = checkPreviewBudget(3, 3);
    expect(res.allowed).toBe(false);
    expect(res.reason).toBe("limit_reached");
  });

  it("stays blocked if the count somehow exceeds the max", () => {
    expect(checkPreviewBudget(4, 3).allowed).toBe(false);
  });

  it("treats max=0 (and any non-positive max) as unlimited", () => {
    expect(checkPreviewBudget(0, 0).allowed).toBe(true);
    expect(checkPreviewBudget(50, 0).allowed).toBe(true);
    expect(checkPreviewBudget(50, -1).allowed).toBe(true);
  });
});

describe("findReusablePreview", () => {
  it("reuses a prior successful preview for the same template + photo", () => {
    const s = newSession();
    s.previews = [preview({ id: "prev_1", templateId: "mock-pixie", inputPhotoRefId: "photo_1" })];
    const found = findReusablePreview(s, "mock-pixie", "photo_1", "hairstyle");
    expect(found?.id).toBe("prev_1");
  });

  it("does NOT reuse a failed preview (but never auto-retries either)", () => {
    const s = newSession();
    s.previews = [
      preview({ id: "prev_1", templateId: "mock-pixie", inputPhotoRefId: "photo_1", status: "failed", errorCode: "error_hair_too_short" })
    ];
    expect(findReusablePreview(s, "mock-pixie", "photo_1", "hairstyle")).toBeNull();
  });

  it("does NOT reuse a still-processing preview", () => {
    const s = newSession();
    s.previews = [preview({ id: "prev_1", templateId: "mock-pixie", inputPhotoRefId: "photo_1", status: "processing" })];
    expect(findReusablePreview(s, "mock-pixie", "photo_1", "hairstyle")).toBeNull();
  });

  it("does not reuse across a different template or a different photo", () => {
    const s = newSession();
    s.previews = [preview({ id: "prev_1", templateId: "mock-pixie", inputPhotoRefId: "photo_1" })];
    expect(findReusablePreview(s, "mock-waves", "photo_1", "hairstyle")).toBeNull();
    expect(findReusablePreview(s, "mock-pixie", "photo_2", "hairstyle")).toBeNull();
  });

  it("does not reuse across a different family even with the same template id", () => {
    const s = newSession();
    s.previews = [preview({ id: "prev_1", templateId: "shared-id", family: "hairstyle", inputPhotoRefId: "photo_1" })];
    expect(findReusablePreview(s, "shared-id", "photo_1", "extension")).toBeNull();
    expect(findReusablePreview(s, "shared-id", "photo_1", "hairstyle")?.id).toBe("prev_1");
  });
});

describe("findInFlightPreview", () => {
  it("finds a still-processing preview for the same template + photo (blocks a duplicate submission)", () => {
    const s = newSession();
    s.previews = [preview({ id: "prev_1", templateId: "mock-pixie", inputPhotoRefId: "photo_1", status: "processing" })];
    expect(findInFlightPreview(s, "mock-pixie", "photo_1", "hairstyle")?.id).toBe("prev_1");
  });

  it("does NOT flag a completed (success or failed) preview as in flight", () => {
    const s = newSession();
    s.previews = [
      preview({ id: "prev_1", templateId: "mock-pixie", inputPhotoRefId: "photo_1", status: "success" }),
      preview({ id: "prev_2", templateId: "mock-waves", inputPhotoRefId: "photo_1", status: "failed" })
    ];
    expect(findInFlightPreview(s, "mock-pixie", "photo_1", "hairstyle")).toBeNull();
    expect(findInFlightPreview(s, "mock-waves", "photo_1", "hairstyle")).toBeNull();
  });

  it("does not match across a different template or a different photo", () => {
    const s = newSession();
    s.previews = [preview({ id: "prev_1", templateId: "mock-pixie", inputPhotoRefId: "photo_1", status: "processing" })];
    expect(findInFlightPreview(s, "mock-waves", "photo_1", "hairstyle")).toBeNull();
    expect(findInFlightPreview(s, "mock-pixie", "photo_2", "hairstyle")).toBeNull();
  });
});

describe("remainingPreviews", () => {
  it("counts down as budget is consumed", () => {
    const s = newSession();
    expect(remainingPreviews(s, 3)).toBe(3);
    s.previewBudgetUsed = 1;
    expect(remainingPreviews(s, 3)).toBe(2);
    s.previewBudgetUsed = 3;
    expect(remainingPreviews(s, 3)).toBe(0);
  });

  it("never returns a negative number", () => {
    const s = newSession();
    s.previewBudgetUsed = 10;
    expect(remainingPreviews(s, 3)).toBe(0);
  });

  it("reports Infinity when the budget is unlimited (max=0)", () => {
    const s = newSession();
    expect(remainingPreviews(s, 0)).toBe(Number.POSITIVE_INFINITY);
    s.previewBudgetUsed = 25;
    expect(remainingPreviews(s, 0)).toBe(Number.POSITIVE_INFINITY);
  });
});
