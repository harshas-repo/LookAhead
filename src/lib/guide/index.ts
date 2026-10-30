/**
 * Deterministic guide (instruction §7B, tech-implementation.md §6).
 *
 * The guide sits ON TOP of the deterministic decision engine. It never invents
 * options, overrides a limit, or pushes the user somewhere the state machine
 * forbids. There is NO LLM: `buildGuide` runs one turn of the deterministic agent
 * loop (observe → apply rules → select → validate → render) and returns structured
 * guidance plus the validated action the UI should present.
 */

import { runAgentTurn } from "../agent";
import type { AgentAction } from "../agent/actions";
import { type GuideResponse } from "../validation";
import type { AppearanceOption, Session, Stage } from "../types";

export interface GuideResult extends GuideResponse {
  /** The deterministic next stage the engine recommends (never overridden). */
  recommendedStage: Stage;
  /** The validated next action the loop chose for this turn. */
  action: AgentAction;
  /** True when the action only PROPOSES a credit spend the user must approve. */
  requiresApproval: boolean;
}

/** The closed set of UI action verbs the guide may recommend. */
export const KNOWN_ACTIONS = [
  "collect_priorities",
  "capture_photo",
  "confirm_hair_record",
  "review_preparation",
  "explore_options",
  "select_plan_a",
  "collect_fallback_preference",
  "select_plan_b",
  "review_plan",
  "finish"
] as const;

export type GuideAction = (typeof KNOWN_ACTIONS)[number];

export interface GuideContext {
  session: Session;
  /** Explorable options for the current stage (built from real templates). */
  options: AppearanceOption[];
  /** The next stage the engine recommends, computed server-side. */
  recommendedStage: Stage;
}

function dedupe(list: string[]): string[] {
  return Array.from(new Set(list.filter(Boolean)));
}

/**
 * Public entry point. Runs ONE turn of the deterministic loop and maps it onto the
 * guide response contract. Pure and side-effect free — no network, no credentials.
 */
export function buildGuide(ctx: GuideContext): GuideResult {
  const turn = runAgentTurn(ctx.session, ctx.options, ctx.recommendedStage);
  return {
    message: turn.guidance.message,
    question: turn.guidance.question,
    choices: dedupe(turn.guidance.choices).slice(0, 6),
    nextAction: turn.guidance.nextAction,
    recommendedStage: turn.recommendedStage,
    action: turn.action,
    requiresApproval: turn.requiresApproval
  };
}
