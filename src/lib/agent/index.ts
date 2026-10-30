/**
 * The bounded, deterministic decision-support loop.
 *
 *   Observe state → Apply deterministic rules → Select action → Validate
 *   → Present to user → Process response → Persist → Reassess
 *
 * There is NO LLM anywhere in this workflow. Every step is transparent,
 * reproducible, and safe offline: the same observed state always yields the same
 * action. Adaptivity comes from the observed state (priorities, answered
 * questions, previews, Plan A/Plan B, remaining budget) driving `selectNextAction`
 * — not from a model. Trusted code selects, validates, renders, and executes; the
 * credit-consuming preview is only ever PROPOSED here and generated elsewhere behind
 * an explicit user request.
 */

import { getConfig } from "../config";
import { QUESTION_BANK } from "../decision/scenarios";
import type { GuideAction } from "../guide";
import type { AppearanceOption, Session, Stage } from "../types";
import type { AgentAction } from "./actions";
import { requiresUserApproval } from "./actions";
import { executeAction } from "./execute";
import { observeState, type AgentState } from "./observe";
import { actionForAnswer, selectNextAction } from "./policy";
import { validateAction, type ValidationResult } from "./validate";

/** Maps the recommended stage onto the closed set of UI action verbs. */
const STAGE_TO_GUIDE_ACTION: Record<Stage, GuideAction> = {
  START: "explore_options",
  PROFILE: "collect_priorities",
  PHOTO_CAPTURE: "capture_photo",
  HAIR_ANALYSIS: "confirm_hair_record",
  PREPARATION: "review_preparation",
  OPTION_EXPLORATION: "explore_options",
  PLAN_A: "select_plan_a",
  SCENARIO_REHEARSAL: "collect_fallback_preference",
  PLAN_B: "select_plan_b",
  PLAN_REVIEW: "review_plan",
  COMPLETE: "finish"
};

/** The rendered, UI-facing guidance for one turn (shape-compatible with GuideResult). */
export interface AgentGuidance {
  message: string;
  question: string | null;
  choices: string[];
  nextAction: GuideAction;
}

export interface AgentTurn {
  /** The validated action the app should present / execute. */
  action: AgentAction;
  guidance: AgentGuidance;
  recommendedStage: Stage;
  /** True when the action merely PROPOSES a credit spend the user must approve. */
  requiresApproval: boolean;
}

function labelFor(state: AgentState, optionId: string): string {
  return state.options.find((o) => o.id === optionId)?.label ?? optionId;
}

function bankMessage(state: AgentState, fallback: string): string {
  return QUESTION_BANK[state.recommendedStage]?.message ?? fallback;
}

/**
 * Turn a validated action into calm, non-clinical guidance. Presentation is fully
 * deterministic: the message, question, and choices all derive from the action and
 * the observed state, so the UI never shows content the state does not support.
 */
export function renderGuidance(action: AgentAction, state: AgentState): AgentGuidance {
  const nextAction = STAGE_TO_GUIDE_ACTION[state.recommendedStage] ?? "explore_options";

  switch (action.type) {
    case "ask_question":
      return {
        message: bankMessage(state, "Let's take the next small step."),
        question: action.prompt,
        choices: action.choices.slice(0, 6),
        nextAction
      };

    case "present_options":
      return {
        message: action.reason || "Here are a few supported options, ordered by what matters to you.",
        question: "Which of these feels most like your next step?",
        choices: action.optionIds.slice(0, 6).map((id) => labelFor(state, id)),
        nextAction
      };

    case "present_scenario":
      return {
        message: "Let's gently rehearse a backup, so you already have one in mind.",
        question: action.question,
        choices: action.choices.slice(0, 6),
        nextAction
      };

    case "propose_preview": {
      const label = labelFor(state, action.optionId);
      const remaining = state.remainingPreviews;
      return {
        message: `You can see how ${label} would look. This uses one of your ${remaining} remaining preview${remaining === 1 ? "" : "s"} — only if you choose to.`,
        question: `Would you like to preview ${label}?`,
        choices: ["Yes, show me a preview", "Not right now"],
        nextAction
      };
    }

    case "review_plan":
      return {
        message: action.reason || "It's worth a quick look to make sure this still feels right.",
        question: "Would you like to review your plan?",
        choices: ["Review my plan", "Keep going"],
        nextAction
      };

    case "record_decision":
      return {
        message: "Got it — we'll remember that.",
        question: null,
        choices: [],
        nextAction
      };

    case "mark_undecided":
      return {
        message: "That's completely fine — you can leave this open and come back to it.",
        question: null,
        choices: [],
        nextAction
      };

    case "complete":
    default:
      return {
        message: "You've prepared a plan you can revisit whenever you like.",
        question: null,
        choices: [],
        nextAction: "finish"
      };
  }
}

/**
 * Apply the deterministic rules, select the next action, and validate it.
 *
 * The policy only ever emits state-consistent actions, so validation normally
 * passes; it is kept as an explicit safety gate (and the single place that proves
 * an action is permitted before it is presented). If an action were somehow invalid
 * we degrade to a calm, always-valid `complete` rather than presenting something
 * the state does not support.
 */
export function selectValidatedAction(state: AgentState): { action: AgentAction; validation: ValidationResult } {
  const selected = selectNextAction(state);
  const validation = validateAction(selected, state);
  if (validation.ok) return { action: selected, validation };
  return { action: { type: "complete" }, validation };
}

/**
 * Process a user's answer to a presented question: turn it into a typed action,
 * VALIDATE it, and only then execute it against the session. An invalid response
 * (e.g. an unsupported scenario choice) is refused and never persisted.
 */
export function processResponse(
  session: Session,
  state: AgentState,
  questionId: string,
  prompt: string,
  answer: string
): { action: AgentAction; validation: ValidationResult; applied: boolean } {
  const action = actionForAnswer(state, questionId, prompt, answer);
  const validation = validateAction(action, state);
  if (!validation.ok) return { action, validation, applied: false };
  executeAction(session, action);
  return { action, validation, applied: true };
}

/**
 * Run ONE turn of the loop. Read-only with respect to persistence: it returns the
 * chosen action + guidance for the caller (the guide route) to present. Mutation
 * happens only through the trusted handlers in `execute.ts`.
 */
export function runAgentTurn(session: Session, options: AppearanceOption[], requestedStage?: Stage): AgentTurn {
  const previewBudgetMax = getConfig().limits.maxPreviewsPerSession;
  const state = observeState(session, options, previewBudgetMax, requestedStage);

  const { action } = selectValidatedAction(state);
  const guidance = renderGuidance(action, state);

  return {
    action,
    guidance,
    recommendedStage: state.recommendedStage,
    requiresApproval: requiresUserApproval(action)
  };
}

export { observeState, selectNextAction, validateAction, requiresUserApproval };
export type { AgentState, AgentAction };
