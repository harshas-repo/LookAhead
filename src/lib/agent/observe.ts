/**
 * Step 1 — Observe (audit instruction §4, Step 1).
 *
 * Builds a compact, secret-free snapshot of everything the guide needs to choose a
 * good next action: the journey stage, confirmed priorities, the hair record
 * (detected vs. user-corrected), which questions are already answered, which
 * previews exist, Plan A / Plan B, remaining preview budget, and the supported
 * option catalogue. Pure and side-effect free — it only reads.
 *
 * This is what lets the workflow adapt instead of following a fixed script: the
 * policy in `policy.ts` reads ONLY this snapshot.
 */

import { hairLengthLabel, suggestNextStage } from "../decision/engine";
import { remainingPreviews } from "../decision/limits";
import { buildScenarioChoices, selectScenario } from "../decision/scenarios";
import type { AppearanceOption, PlanEntry, Priority, Session, Stage } from "../types";

export interface ObservedHair {
  /** Length the provider detected (null if none/failed). */
  detected: string | null;
  /** Length the user corrected it to (null if they accepted/ skipped). */
  corrected: string | null;
  finalLabel: string | null;
  status: "pending" | "success" | "failed" | "skipped" | null;
  errorCode: string | null;
}

export interface ObservedScenario {
  id: string;
  question: string;
  decisionQuestionId: string;
  choices: string[];
}

export interface AgentState {
  /** The session's own recorded stage. */
  stage: Stage;
  /** The engine's honest "what is missing next" — drives action selection. */
  recommendedStage: Stage;
  priorities: Priority[];
  topPriorities: Priority[];
  hasPhoto: boolean;
  consentGranted: boolean;
  hair: ObservedHair | null;
  /** Every question the user has already responded to (resolved OR undecided). */
  answeredQuestionIds: string[];
  resolvedQuestionIds: string[];
  unresolvedQuestionIds: string[];
  /** Templates already turned into previews, so we never re-propose them. */
  previewedTemplateIds: string[];
  planA: PlanEntry | null;
  planB: PlanEntry | null;
  /** True when Plan B no longer makes sense given Plan A (audit §6C). */
  needPlanBReview: boolean;
  /** Supported options, already ordered by the user's priorities. */
  options: AppearanceOption[];
  availableOptionIds: string[];
  visualizableOptionIds: string[];
  scenario: ObservedScenario;
  previewBudgetUsed: number;
  previewBudgetMax: number;
  remainingPreviews: number;
}

/**
 * Observe the session. `requestedStage` lets a screen hint where the user is
 * looking; when omitted we fall back to the engine's `suggestNextStage`, so the
 * guidance always reflects what is genuinely outstanding.
 */
export function observeState(
  session: Session,
  options: AppearanceOption[],
  previewBudgetMax: number,
  requestedStage?: Stage
): AgentState {
  const analysis = session.hairRecord.analysis;
  const detected = analysis && analysis.status === "success" ? hairLengthLabel(analysis.length) : null;
  const corrected = analysis?.userCorrection ? hairLengthLabel(analysis.userCorrection) : null;

  const hair: ObservedHair | null = analysis
    ? {
        detected,
        corrected,
        finalLabel: corrected ?? detected ?? null,
        status: analysis.status,
        errorCode: analysis.errorCode
      }
    : null;

  const answeredQuestionIds = session.decisions.map((d) => d.questionId);
  const resolvedQuestionIds = session.decisions.filter((d) => d.isResolved).map((d) => d.questionId);
  const unresolvedQuestionIds = session.decisions.filter((d) => !d.isResolved).map((d) => d.questionId);

  const previewedTemplateIds = session.previews.map((p) => p.templateId);

  const availableOptionIds = options.map((o) => o.id);
  const visualizableOptionIds = options.filter((o) => o.visualizable).map((o) => o.id);

  const planA = session.plan.planA;
  const planB = session.plan.planB;
  // Plan B needs a review when it duplicates Plan A (e.g. Plan A was changed onto
  // it) or points at an option that is no longer available. We ASK rather than
  // silently overwrite (audit §6C).
  const needPlanBReview = Boolean(
    planA &&
      planB &&
      ((planB.optionId !== null && planB.optionId === planA.optionId) ||
        (planB.optionId !== null && !availableOptionIds.includes(planB.optionId)))
  );

  const usedScenarioKeys = new Set(
    session.decisions
      .filter((d) => d.questionId.startsWith("scenario_"))
      .map((d) => d.questionId.replace(/^scenario_/, ""))
  );
  const scenario = selectScenario(planA, usedScenarioKeys);
  const observedScenario: ObservedScenario = {
    id: scenario.id,
    question: scenario.question,
    decisionQuestionId: scenario.decisionQuestionId,
    choices: buildScenarioChoices(options, planA)
  };

  const recommendedStage = requestedStage ?? suggestNextStage(session);

  return {
    stage: session.currentStage,
    recommendedStage,
    priorities: session.profile.priorities,
    topPriorities: session.profile.topPriorities,
    hasPhoto: session.hairRecord.photoRef !== null,
    consentGranted: session.profile.consent.granted,
    hair,
    answeredQuestionIds,
    resolvedQuestionIds,
    unresolvedQuestionIds,
    previewedTemplateIds,
    planA,
    planB,
    needPlanBReview,
    options,
    availableOptionIds,
    visualizableOptionIds,
    scenario: observedScenario,
    previewBudgetUsed: session.previewBudgetUsed,
    previewBudgetMax,
    remainingPreviews: remainingPreviews(session, previewBudgetMax)
  };
}

/** Convenience predicate used by the policy + validator. */
export function hasAnswered(state: AgentState, questionId: string): boolean {
  return state.answeredQuestionIds.includes(questionId);
}
