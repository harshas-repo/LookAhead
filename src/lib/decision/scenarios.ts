/**
 * Scenario library + guided question bank (tech-implementation.md §6, instruction §7C).
 *
 * These are practical PLANNING exercises — not medical predictions. Each scenario
 * offers a small set of choices plus an explicit "leave unresolved" path, and the
 * user always makes the final decision.
 */

import type { AppearanceOption, PlanEntry } from "../types";

export interface Scenario {
  id: string;
  /** Short situation description shown to the user. */
  situation: string;
  /** The decision question. */
  question: string;
  /** Which Plan A categories this scenario is relevant to (empty = any). */
  appliesTo: Array<AppearanceOption["category"]>;
  /** Stable id for the decision record produced from this scenario. */
  decisionQuestionId: string;
}

export const SCENARIOS: Scenario[] = [
  {
    id: "uncomfortable",
    situation:
      "Imagine your first choice feels uncomfortable on a particular day — maybe it's warm, or it just doesn't feel right.",
    question: "What would you prefer to do instead on a day like that?",
    appliesTo: ["hairstyle", "covering"],
    decisionQuestionId: "scenario_uncomfortable"
  },
  {
    id: "change_mind_covering",
    situation: "Imagine you decide you'd rather not cover your head on a given day.",
    question: "What feels like a comfortable alternative when you'd prefer not to cover up?",
    appliesTo: ["covering"],
    decisionQuestionId: "scenario_change_mind_covering"
  },
  {
    id: "unavailable",
    situation: "Imagine your first choice isn't available when you need it — it's being washed, adjusted, or hasn't arrived yet.",
    question: "What would you fall back on in the meantime?",
    appliesTo: ["hairstyle", "covering"],
    decisionQuestionId: "scenario_unavailable"
  },
  {
    id: "different_setting",
    situation: "Imagine a particular setting or event where you'd like a different look than your everyday choice.",
    question: "What would you prefer for that occasion?",
    appliesTo: [],
    decisionQuestionId: "scenario_different_setting"
  }
];

/**
 * Choose the most relevant scenario for the user's Plan A. Rules are transparent
 * and deterministic; the guide never overrides this choice.
 */
export function selectScenario(planA: PlanEntry | null, alreadyUsed: Set<string>): Scenario {
  const category = planA?.optionId ? guessCategory(planA.optionId) : null;
  const eligible = SCENARIOS.filter((s) => !alreadyUsed.has(s.id)).filter((s) =>
    s.appliesTo.length === 0 ? true : category ? s.appliesTo.includes(category) : true
  );
  if (eligible.length > 0) return eligible[0];
  // Everything used once — fall back to the general comfort scenario.
  return SCENARIOS[0];
}

function guessCategory(optionId: string): AppearanceOption["category"] | null {
  // Option ids are family-prefixed (options.ts): extensions play the covering/wig
  // role; hairstyles, bangs and volume all restyle the user's own hair.
  if (optionId.startsWith("ext_")) return "covering";
  if (optionId.startsWith("style_") || optionId.startsWith("bang_") || optionId.startsWith("vol_")) return "hairstyle";
  return null;
}

/**
 * Build the fallback choices for a scenario from the options the user has NOT
 * already chosen as Plan A. Always includes an explicit "undecided" path.
 */
export function buildScenarioChoices(options: AppearanceOption[], planA: PlanEntry | null): string[] {
  const chosen = planA?.optionId ?? null;
  const alternatives = options
    .filter((o) => o.id !== chosen)
    .slice(0, 4)
    .map((o) => o.label);
  return [...alternatives, "Leave this undecided for now"];
}

/** Question bank used by the deterministic guide. */
export const QUESTION_BANK: Record<string, { message: string; question: string | null; nextAction: string }> = {
  PROFILE: {
    message: "Let's start with what matters most to you. There are no wrong answers.",
    question: "Which of these feels most important right now?",
    nextAction: "collect_priorities"
  },
  PHOTO_CAPTURE: {
    message: "A current photo lets you see options in context. You control whether to take or upload one.",
    question: "Would you like to add a photo of your current look?",
    nextAction: "capture_photo"
  },
  HAIR_ANALYSIS: {
    message: "This describes your hair in the photo today — it does not predict any future change.",
    question: "Does this match what you see?",
    nextAction: "confirm_hair_record"
  },
  PREPARATION: {
    message: "Some choices are easier to make early, while you have time and options.",
    question: "Which of these would you like to think about first?",
    nextAction: "review_preparation"
  },
  OPTION_EXPLORATION: {
    message: "You can explore a supported hairstyle preview, or consider covering options — whichever helps.",
    question: "What would you like to explore first?",
    nextAction: "explore_options"
  },
  PLAN_A: {
    message: "No pressure to have it all figured out. A first preference is enough to start.",
    question: "Which option feels most like your Plan A right now?",
    nextAction: "select_plan_a"
  },
  SCENARIO_REHEARSAL: {
    message: "Let's gently stress-test that choice, so you already have a fallback in mind.",
    question: "If that didn't work on a given day, what would you prefer instead?",
    nextAction: "collect_fallback_preference"
  },
  PLAN_B: {
    message: "A backup is simply something that would also be okay. It can stay flexible.",
    question: "What would you like as your Plan B?",
    nextAction: "select_plan_b"
  },
  PLAN_REVIEW: {
    message: "Here's your plan so far. You can change any of it, at any time.",
    question: "Is there anything you'd like to add or adjust?",
    nextAction: "review_plan"
  },
  COMPLETE: {
    message: "You've prepared a plan you can revisit whenever you like.",
    question: null,
    nextAction: "finish"
  }
};
