/**
 * Step 3 — Validate the proposed action (audit instruction §4 Step 3, §5, §7).
 *
 * An action is only allowed if it is safe and honest given the observed state:
 *  - it refers ONLY to supported options / real template ids (never invented),
 *  - it respects the preview budget and the "propose, don't generate" rule,
 *  - it does not re-ask a question the user already answered,
 *  - it never assumes an unconfirmed preference.
 *
 * The model may propose anything; this gate is what keeps the app predictable when
 * it does not. Invalid actions are rejected and the caller falls back to the
 * deterministic policy.
 */

import type { AgentAction } from "./actions";
import { hasAnswered, type AgentState } from "./observe";
import { UNDECIDED_CHOICE } from "./policy";

export type ValidationRejection =
  | "unknown_option"
  | "unsupported_preview"
  | "preview_limit_reached"
  | "repeat_question"
  | "unknown_scenario"
  | "invalid_choice"
  | "not_permitted_at_stage"
  | "empty_action";

export interface ValidationResult {
  ok: boolean;
  reason?: ValidationRejection;
  /** Human-readable explanation, safe to log (no secrets, no image content). */
  detail?: string;
}

const OK: ValidationResult = { ok: true };

function reject(reason: ValidationRejection, detail: string): ValidationResult {
  return { ok: false, reason, detail };
}

/** Options that can actually be rendered as a preview by the configured provider. */
function visualizableTemplateFor(state: AgentState, optionId: string): string | null {
  const option = state.options.find((o) => o.id === optionId);
  if (!option || !option.visualizable) return null;
  return option.templateIds[0] ?? null;
}

export function validateAction(action: AgentAction, state: AgentState): ValidationResult {
  switch (action.type) {
    case "ask_question": {
      if (action.choices.length === 0) return reject("empty_action", "A question needs at least one choice.");
      if (hasAnswered(state, action.questionId)) {
        return reject("repeat_question", `Question '${action.questionId}' was already answered.`);
      }
      return OK;
    }

    case "present_options": {
      if (action.optionIds.length === 0) return reject("empty_action", "No options to present.");
      for (const id of action.optionIds) {
        if (!state.availableOptionIds.includes(id)) {
          return reject("unknown_option", `Option '${id}' is not in the supported catalogue.`);
        }
      }
      return OK;
    }

    case "present_scenario": {
      if (action.scenarioId !== state.scenario.id) {
        return reject("unknown_scenario", `Scenario '${action.scenarioId}' is not the current supported scenario.`);
      }
      for (const choice of action.choices) {
        if (!state.scenario.choices.includes(choice)) {
          return reject("invalid_choice", `Scenario choice '${choice}' is not supported.`);
        }
      }
      return OK;
    }

    case "record_decision": {
      // Never record a preference the user has not actually expressed. The answer
      // must be a real choice for a scenario, and never the "undecided" sentinel.
      if (action.selectedOption === UNDECIDED_CHOICE) {
        return reject("invalid_choice", "Use mark_undecided to leave something open.");
      }
      if (action.questionId.startsWith("scenario_") && !state.scenario.choices.includes(action.selectedOption)) {
        return reject("invalid_choice", `Answer '${action.selectedOption}' is not a supported scenario choice.`);
      }
      return OK;
    }

    case "mark_undecided":
      return OK;

    case "propose_preview": {
      const templateId = visualizableTemplateFor(state, action.optionId);
      if (!templateId) {
        return reject("unsupported_preview", `Option '${action.optionId}' cannot be previewed by this provider.`);
      }
      if (templateId !== action.templateId) {
        return reject("unsupported_preview", "Template id does not match the option's real template.");
      }
      if (state.remainingPreviews <= 0) {
        return reject("preview_limit_reached", "No previews remaining in this session's budget.");
      }
      return OK;
    }

    case "review_plan":
      return OK;

    case "complete":
      return OK;

    default:
      return reject("not_permitted_at_stage", "Unrecognized action type.");
  }
}
