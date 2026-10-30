/**
 * Step 2/3 — Apply the deterministic rules and decide what is most useful next.
 *
 * A transparent policy that maps the observed state to ONE next action. It is the
 * single source of behaviour for the guide: there is no model, so the same state
 * always produces the same action.
 *
 * Adaptivity is real, not cosmetic: the user's priorities change WHICH action is
 * chosen and WHICH options are surfaced — not merely the wording. For example, a
 * cost-conscious user is never nudged to spend a preview credit, while a user who
 * wants to look like themselves is offered a visual preview first.
 */

import { QUESTION_BANK } from "../decision/scenarios";
import { PRIORITY_LABELS } from "../labels";
import type { Priority } from "../types";
import type { AgentAction } from "./actions";
import type { AgentState } from "./observe";

export const UNDECIDED_CHOICE = "Leave this undecided for now";

function priorityChoices(): string[] {
  return (Object.keys(PRIORITY_LABELS) as Priority[]).map((p) => PRIORITY_LABELS[p].label);
}

/** True when the user's priorities suggest a visual preview is worth a credit. */
export function wantsVisualPreview(state: AgentState): boolean {
  const openToVisual =
    state.priorities.includes("familiar_appearance") || state.priorities.includes("control_timing");
  const costConscious = state.priorities.includes("cost");
  return openToVisual && !costConscious;
}

/** First visualizable option that has not already been previewed. */
export function nextPreviewCandidate(state: AgentState): { optionId: string; templateId: string } | null {
  for (const option of state.options) {
    const templateId = option.templateIds[0];
    if (option.visualizable && templateId && !state.previewedTemplateIds.includes(templateId)) {
      return { optionId: option.id, templateId };
    }
  }
  return null;
}

/** The top few supported option ids, in the user's priority order. */
export function topOptionIds(state: AgentState, limit = 4): string[] {
  return state.options.slice(0, limit).map((o) => o.id);
}

/** Plan B answers exclude the current Plan A and always allow "undecided". */
export function planBChoices(state: AgentState): string[] {
  const chosen = state.planA?.optionId ?? null;
  const alternatives = state.options
    .filter((o) => o.id !== chosen)
    .slice(0, 4)
    .map((o) => o.label);
  return [...alternatives, UNDECIDED_CHOICE];
}

function photoChoices(state: AgentState): string[] {
  // Someone who wants to look like themselves benefits most from a preview, which
  // needs a photo — so lead with capture. Otherwise photo is genuinely optional.
  return wantsVisualPreview(state)
    ? ["Take a photo", "Upload a photo", "Skip for now"]
    : ["Upload a photo", "Take a photo", "Skip for now"];
}

/**
 * Choose the single most useful next action for the observed state.
 *
 * Ordering rationale:
 *  1. A Plan B that no longer fits Plan A is surfaced first (audit §6C).
 *  2. Otherwise we act on the engine's recommended (first incomplete) stage.
 *  3. Within a stage, priorities personalise the concrete action/recommendation.
 *  4. Answered questions are never re-asked (audit §6B).
 */
export function selectNextAction(state: AgentState): AgentAction {
  // 1) Plan consistency review takes precedence — a changed Plan A can invalidate B.
  if (state.needPlanBReview) {
    return {
      type: "review_plan",
      focus: "planB",
      reason: "Your Plan A changed, so it's worth checking your backup still feels right."
    };
  }

  switch (state.recommendedStage) {
    case "PROFILE":
      return {
        type: "ask_question",
        questionId: "priorities",
        prompt: QUESTION_BANK.PROFILE.question ?? "What matters most to you right now?",
        choices: priorityChoices()
      };

    case "PHOTO_CAPTURE":
      return {
        type: "ask_question",
        questionId: "photo_capture",
        prompt: QUESTION_BANK.PHOTO_CAPTURE.question ?? "Would you like to add a photo?",
        choices: photoChoices(state)
      };

    case "HAIR_ANALYSIS":
      return {
        type: "ask_question",
        questionId: "hair_analysis",
        prompt: QUESTION_BANK.HAIR_ANALYSIS.question ?? "Does this match what you see?",
        choices: ["Yes, that matches", "Let me correct it", "Skip the analysis"]
      };

    case "PREPARATION":
      return {
        type: "ask_question",
        questionId: "preparation",
        prompt: QUESTION_BANK.PREPARATION.question ?? "What would you like to think about first?",
        choices: ["Show me what I can prepare early", "Continue"]
      };

    case "OPTION_EXPLORATION": {
      // Personalised: propose a preview only when it fits priorities AND budget AND
      // there is a supported style not yet previewed. Propose, never generate.
      const candidate = nextPreviewCandidate(state);
      if (candidate && state.remainingPreviews > 0 && wantsVisualPreview(state) && state.hasPhoto) {
        return { type: "propose_preview", optionId: candidate.optionId, templateId: candidate.templateId };
      }
      return {
        type: "present_options",
        optionIds: topOptionIds(state),
        reason: "Ordered by what you told us matters most."
      };
    }

    case "PLAN_A":
      return {
        type: "present_options",
        optionIds: topOptionIds(state),
        reason: "Pick whichever feels most like your first preference — no pressure."
      };

    case "SCENARIO_REHEARSAL":
      return {
        type: "present_scenario",
        scenarioId: state.scenario.id,
        question: state.scenario.question,
        choices: state.scenario.choices
      };

    case "PLAN_B":
      return {
        type: "ask_question",
        questionId: "select_plan_b",
        prompt: QUESTION_BANK.PLAN_B.question ?? "What would you like as your Plan B?",
        choices: planBChoices(state)
      };

    case "PLAN_REVIEW":
      return {
        type: "review_plan",
        focus: state.planA && state.planB ? "both" : state.planA ? "planB" : "planA",
        reason: "Check your plan still feels right before you save or print it."
      };

    case "COMPLETE":
    default:
      return { type: "complete" };
  }
}

/**
 * The deterministic action for a specific question the user is answering, used to
 * turn a UI choice into a validated record/mark action.
 */
export function actionForAnswer(
  _state: AgentState,
  questionId: string,
  prompt: string,
  answer: string
): AgentAction {
  // "Undecided" (or a blank answer) is a legitimate, first-class outcome — it is
  // recorded as unresolved rather than as a preference the user never expressed.
  if (answer === UNDECIDED_CHOICE || answer.trim().length === 0) {
    return { type: "mark_undecided", questionId, prompt };
  }
  return { type: "record_decision", questionId, prompt, selectedOption: answer };
}
