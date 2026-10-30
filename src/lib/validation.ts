/**
 * LookAhead — request/response validation with Zod.
 *
 * Every server route validates its input with these schemas and returns a
 * consistent error shape. This keeps the client contract stable and prevents
 * malformed or malicious payloads from reaching provider adapters.
 */

import { z } from "zod";
import { HAIR_LENGTHS, PRIORITIES, STAGES, TRY_ON_FAMILIES } from "./types";

export const prioritySchema = z.enum(PRIORITIES);
export const stageSchema = z.enum(STAGES);
export const hairLengthSchema = z.enum(HAIR_LENGTHS);

/**
 * POST /api/access — the Private Preview pass. The value is compared server-side
 * with LOOKAHEAD_ACCESS_CODE and never echoed back; we only constrain its shape.
 */
export const accessRequestSchema = z.object({
  code: z.string().min(1).max(200)
});

/** PATCH /api/sessions/:id — save profile / preferences. */
export const updateProfileSchema = z.object({
  priorities: z.array(prioritySchema).max(PRIORITIES.length).optional(),
  topPriorities: z.array(prioritySchema).max(2).optional(),
  optionalTreatmentDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected an ISO date (yyyy-mm-dd)")
    .nullish(),
  consentGranted: z.boolean().optional(),
  currentStage: stageSchema.optional()
});

/** Photo upload metadata (the binary is handled separately as multipart/bytes). */
export const photoMetaSchema = z.object({
  width: z.number().int().positive().max(8192),
  height: z.number().int().positive().max(8192),
  /** Normalized JPEG size in bytes. */
  sizeBytes: z.number().int().positive().max(10 * 1024 * 1024)
});

/**
 * POST /api/sessions/:id/hair-analysis
 *
 * `photoRefId` is optional: the route runs whichever detections have inputs (the
 * front photo for length, the density angle for density, the front+right+left trio
 * for type) and reuses any prior success, so a caller may trigger a re-analysis
 * without naming a specific photo.
 */
export const hairAnalysisRequestSchema = z.object({
  photoRefId: z.string().min(1).optional()
});

/** User confirming or correcting the analysis result. */
export const hairAnalysisCorrectionSchema = z.object({
  action: z.enum(["confirm", "correct", "skip"]),
  correctedLength: hairLengthSchema.optional()
});

/** POST /api/sessions/:id/previews */
export const previewRequestSchema = z.object({
  templateId: z.string().min(1),
  photoRefId: z.string().min(1)
});

/** POST /api/sessions/:id/guide — structured state in, constrained response out. */
export const guideRequestSchema = z.object({
  currentStage: stageSchema
});

/** POST /api/sessions/:id/decisions */
export const decisionSchema = z.object({
  questionId: z.string().min(1),
  prompt: z.string().min(1).max(500),
  selectedOption: z.string().max(200).nullable().optional(),
  isResolved: z.boolean(),
  note: z.string().max(1000).nullable().optional()
});

/** Setting Plan A / Plan B. */
export const planEntrySchema = z.object({
  label: z.string().min(1).max(200),
  optionId: z.string().max(100).nullable().optional(),
  previewId: z.string().max(100).nullable().optional(),
  /**
   * Representative image for the plan card. Deliberately NOT `.url()`: mock mode
   * uses local `/images/...` paths, and live mode uses provider https thumbs —
   * both are relative-or-absolute strings we simply echo back for an <img src>.
   */
  imageUrl: z.string().max(2000).nullable().optional(),
  family: z.enum(TRY_ON_FAMILIES).optional(),
  rationale: z.string().max(1000).nullable().optional()
});

export const planUpdateSchema = z.object({
  planA: planEntrySchema.nullish(),
  planB: planEntrySchema.nullish(),
  questionsForCareTeam: z.array(z.string().max(500)).max(20).optional()
});

/**
 * The guide response contract (tech-implementation.md §6). The deterministic guide
 * route returns exactly this shape, so the client can rely on a stable structure.
 */
export const guideResponseSchema = z.object({
  message: z.string().max(600),
  question: z.string().max(400).nullable(),
  choices: z.array(z.string().max(160)).max(6),
  nextAction: z.string().max(80)
});

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type DecisionInput = z.infer<typeof decisionSchema>;
export type PlanUpdateInput = z.infer<typeof planUpdateSchema>;
export type GuideResponse = z.infer<typeof guideResponseSchema>;
