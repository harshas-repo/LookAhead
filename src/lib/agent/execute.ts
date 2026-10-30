/**
 * Step 5 — Execute only permitted actions (audit instruction §4 Step 5, §7).
 *
 * These are the trusted handlers that turn a VALIDATED action into a session
 * mutation. They are pure functions over the `Session` object (no HTTP, no fs) so
 * they can be unit-tested and so the route handlers and the agent share ONE
 * implementation instead of drifting apart. Persistence itself still happens
 * through `saveSession` in the store, called by the routes.
 *
 * The model never calls these directly: an action must pass `validateAction`
 * first, and credit-consuming preview generation is NOT here at all — it stays
 * behind POST /previews, which the user must explicitly trigger.
 */

import { stageIndex } from "../decision/engine";
import { generateId } from "../store";
import type { Decision, PlanEntry, Session, Stage, TryOnFamily } from "../types";
import type { AgentAction } from "./actions";

/** Upsert a decision by questionId, mirroring POST /api/sessions/:id/decisions. */
export function recordDecision(
  session: Session,
  input: {
    questionId: string;
    prompt: string;
    selectedOption: string | null;
    isResolved: boolean;
    note?: string | null;
  }
): Session {
  const existing = session.decisions.find((d) => d.questionId === input.questionId);
  const record: Decision = {
    id: existing?.id ?? generateId("dec"),
    questionId: input.questionId,
    prompt: input.prompt,
    selectedOption: input.selectedOption,
    isResolved: input.isResolved,
    note: input.note ?? null,
    answeredAt: new Date().toISOString()
  };
  if (existing) Object.assign(existing, record);
  else session.decisions.push(record);

  // Reflect progress without forcing forward jumps (same rule as the route).
  if (input.questionId.startsWith("scenario_") && session.currentStage === "PLAN_A") {
    session.currentStage = "SCENARIO_REHEARSAL";
  }
  return session;
}

/** Record an explicitly-undecided outcome — valid, never a failure (audit §6D). */
export function markUndecided(session: Session, questionId: string, prompt: string): Session {
  return recordDecision(session, { questionId, prompt, selectedOption: null, isResolved: false });
}

function toEntry(input: {
  label: string;
  optionId?: string | null;
  previewId?: string | null;
  imageUrl?: string | null;
  family?: TryOnFamily;
  rationale?: string | null;
}): PlanEntry {
  return {
    label: input.label,
    optionId: input.optionId ?? null,
    previewId: input.previewId ?? null,
    imageUrl: input.imageUrl ?? null,
    family: input.family,
    rationale: input.rationale ?? null
  };
}

/** Move the stage forward to `target` only if we are currently behind it. */
export function moveForward(session: Session, target: Stage): void {
  if (stageIndex(target) > stageIndex(session.currentStage)) session.currentStage = target;
}

export interface PlanPatch {
  planA?:
    | { label: string; optionId?: string | null; previewId?: string | null; imageUrl?: string | null; family?: TryOnFamily; rationale?: string | null }
    | null;
  planB?:
    | { label: string; optionId?: string | null; previewId?: string | null; imageUrl?: string | null; family?: TryOnFamily; rationale?: string | null }
    | null;
  questionsForCareTeam?: string[];
}

/** Apply a plan patch, mirroring PATCH /api/sessions/:id/plan. */
export function applyPlanPatch(session: Session, patch: PlanPatch): Session {
  if (patch.planA !== undefined) {
    session.plan.planA = patch.planA === null ? null : toEntry(patch.planA);
    if (session.plan.planA) moveForward(session, "PLAN_A");
  }
  if (patch.planB !== undefined) {
    session.plan.planB = patch.planB === null ? null : toEntry(patch.planB);
    if (session.plan.planB) moveForward(session, "PLAN_B");
  }
  if (patch.questionsForCareTeam !== undefined) {
    session.plan.questionsForCareTeam = patch.questionsForCareTeam;
  }
  session.plan.updatedAt = new Date().toISOString();
  return session;
}

/**
 * Execute a validated, non-credit-consuming action against the session. Returns
 * the (mutated) session, or null when the action is a presentation-only step that
 * has no persistence side effect. Preview generation is deliberately absent — it
 * requires an explicit user request through the previews route.
 */
export function executeAction(session: Session, action: AgentAction): Session | null {
  switch (action.type) {
    case "record_decision":
      return recordDecision(session, {
        questionId: action.questionId,
        prompt: action.prompt,
        selectedOption: action.selectedOption,
        isResolved: true
      });
    case "mark_undecided":
      return markUndecided(session, action.questionId, action.prompt);
    default:
      // ask_question / present_options / present_scenario / propose_preview /
      // review_plan / complete are presentation steps — nothing to persist here.
      return null;
  }
}
