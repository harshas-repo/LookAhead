/**
 * Agent action catalogue (audit instruction §5).
 *
 * A small, closed set of TYPED actions the guide may propose. Every action has a
 * Zod-validated payload and a matching handler in `execute.ts`. The model may only
 * SELECT one of these; trusted application code validates and executes it. Nothing
 * here lets a model mutate the session directly, call arbitrary URLs, or bypass the
 * preview budget / consent / validation checks.
 *
 * These reuse the existing domain vocabulary (option ids, template ids, scenario
 * ids, question ids) rather than introducing a parallel abstraction.
 */

import { z } from "zod";

export const AGENT_ACTION_TYPES = [
  "ask_question",
  "present_options",
  "present_scenario",
  "record_decision",
  "mark_undecided",
  "propose_preview",
  "review_plan",
  "complete"
] as const;

export type AgentActionType = (typeof AGENT_ACTION_TYPES)[number];

/** Ask the user one clarifying question, with a small set of permitted answers. */
export const askQuestionSchema = z.object({
  type: z.literal("ask_question"),
  /** Stable id so we never ask the same question twice (see validate.ts). */
  questionId: z.string().min(1),
  prompt: z.string().min(1).max(400),
  choices: z.array(z.string().min(1).max(160)).max(6)
});

/** Show a subset of the real, supported option catalogue. */
export const presentOptionsSchema = z.object({
  type: z.literal("present_options"),
  /** Must all exist in the current catalogue (never invented). */
  optionIds: z.array(z.string().min(1)).min(1).max(6),
  /** Optional, human-readable rationale used for transparency/logging. */
  reason: z.string().max(200).optional()
});

/** Offer the deterministic rehearsal scenario for the user's Plan A. */
export const presentScenarioSchema = z.object({
  type: z.literal("present_scenario"),
  scenarioId: z.string().min(1),
  question: z.string().min(1).max(400),
  /** Always includes an explicit "leave undecided" path (added by the policy). */
  choices: z.array(z.string().min(1).max(160)).max(6)
});

/** Record a preference the user has actually expressed/confirmed. */
export const recordDecisionSchema = z.object({
  type: z.literal("record_decision"),
  questionId: z.string().min(1),
  prompt: z.string().min(1).max(400),
  selectedOption: z.string().min(1).max(200)
});

/** Explicitly leave something undecided — a valid, non-failure outcome. */
export const markUndecidedSchema = z.object({
  type: z.literal("mark_undecided"),
  questionId: z.string().min(1),
  prompt: z.string().min(1).max(400)
});

/**
 * PROPOSE (never generate) a hairstyle preview. Generation still requires an
 * explicit user request through POST /previews, which enforces the budget.
 */
export const proposePreviewSchema = z.object({
  type: z.literal("propose_preview"),
  /** Must be a visualizable option bound to a real template id. */
  optionId: z.string().min(1),
  templateId: z.string().min(1)
});

/** Re-check whether Plan A / Plan B still make sense after a change. */
export const reviewPlanSchema = z.object({
  type: z.literal("review_plan"),
  focus: z.enum(["planA", "planB", "both"]),
  reason: z.string().min(1).max(200)
});

/** Produce the final plan from persisted decisions. */
export const completeSchema = z.object({
  type: z.literal("complete")
});

/** The validated union the model is allowed to emit / the policy may return. */
export const agentActionSchema = z.discriminatedUnion("type", [
  askQuestionSchema,
  presentOptionsSchema,
  presentScenarioSchema,
  recordDecisionSchema,
  markUndecidedSchema,
  proposePreviewSchema,
  reviewPlanSchema,
  completeSchema
]);

export type AgentAction = z.infer<typeof agentActionSchema>;
export type AskQuestionAction = z.infer<typeof askQuestionSchema>;
export type PresentOptionsAction = z.infer<typeof presentOptionsSchema>;
export type PresentScenarioAction = z.infer<typeof presentScenarioSchema>;
export type RecordDecisionAction = z.infer<typeof recordDecisionSchema>;
export type MarkUndecidedAction = z.infer<typeof markUndecidedSchema>;
export type ProposePreviewAction = z.infer<typeof proposePreviewSchema>;
export type ReviewPlanAction = z.infer<typeof reviewPlanSchema>;
export type CompleteAction = z.infer<typeof completeSchema>;

/** Actions that only ever PROPOSE a credit-consuming operation (need approval). */
export function requiresUserApproval(action: AgentAction): boolean {
  return action.type === "propose_preview";
}
