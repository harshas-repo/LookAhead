/**
 * Behavioural tests for the bounded, deterministic decision-support workflow.
 *
 * Each test maps to one of the twelve required behaviours. They exercise the real
 * observe → select → validate → execute → reassess loop with NO network and NO
 * live provider — the workflow is fully deterministic and works in mock mode.
 */

import { describe, it, expect } from "vitest";
import { newSession } from "@/lib/store";
import { assemblePlan } from "@/lib/decision/engine";
import { KNOWN_ACTIONS, buildGuide } from "@/lib/guide";
import type { AppearanceOption, HairAnalysisResult, PhotoRef, Priority, Session } from "@/lib/types";
import { observeState } from "./observe";
import { selectNextAction, UNDECIDED_CHOICE } from "./policy";
import { validateAction } from "./validate";
import { requiresUserApproval, type AgentAction } from "./actions";
import { processResponse, runAgentTurn, selectValidatedAction } from "./index";
import { markUndecided, recordDecision } from "./execute";

const OPTIONS: AppearanceOption[] = [
  { id: "style_pixie", label: "Pixie Cut", description: "", visualizable: true, templateIds: ["tpl-pixie"], category: "hairstyle" },
  { id: "wig", label: "Wig", description: "", visualizable: false, templateIds: [], category: "covering" },
  { id: "scarf", label: "Scarf or head wrap", description: "", visualizable: false, templateIds: [], category: "covering" }
];

function photo(): PhotoRef {
  return { id: "photo_1", storedPath: "/tmp/photo_1.jpg", width: 800, height: 800, createdAt: new Date().toISOString() };
}

function skippedAnalysis(): HairAnalysisResult {
  return {
    provider: "mock-hair-length",
    length: "unknown",
    rawResult: null,
    userCorrection: null,
    status: "skipped",
    errorCode: null,
    analyzedAt: new Date().toISOString()
  };
}

function sessionWith(priorities: Priority[], opts: { photo?: boolean; analysis?: boolean } = {}): Session {
  const s = newSession();
  s.profile.priorities = priorities;
  if (opts.photo) s.hairRecord.photoRef = photo();
  if (opts.analysis) s.hairRecord.analysis = skippedAnalysis();
  return s;
}

const PREVIEW_OK: AgentAction = { type: "propose_preview", optionId: "style_pixie", templateId: "tpl-pixie" };

describe("1 — priorities change the next ACTION, not just the wording", () => {
  it("offers a preview to a visual-first user but not to a cost-conscious one", () => {
    const visual = observeState(sessionWith(["familiar_appearance"], { photo: true }), OPTIONS, 3, "OPTION_EXPLORATION");
    const costed = observeState(sessionWith(["cost"], { photo: true }), OPTIONS, 3, "OPTION_EXPLORATION");

    const visualAction = selectNextAction(visual);
    const costedAction = selectNextAction(costed);

    expect(visualAction.type).toBe("propose_preview");
    expect(costedAction.type).toBe("present_options");
    expect(visualAction.type).not.toBe(costedAction.type);
  });
});

describe("2 — never repeat a question already answered", () => {
  it("rejects re-asking an answered question", () => {
    const s = sessionWith(["comfort"]);
    recordDecision(s, { questionId: "priorities", prompt: "What matters most?", selectedOption: "Physical comfort", isResolved: true });

    const state = observeState(s, OPTIONS, 3, "PROFILE");
    const verdict = validateAction({ type: "ask_question", questionId: "priorities", prompt: "Again?", choices: ["a"] }, state);

    expect(state.answeredQuestionIds).toContain("priorities");
    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toBe("repeat_question");
  });
});

describe("3 — a newly recorded decision changes the next recommended action", () => {
  it("advances the recommendation once exploration is resolved", () => {
    const s = sessionWith(["cost"], { photo: true, analysis: true });
    const before = observeState(s, OPTIONS, 3);
    expect(before.recommendedStage).toBe("OPTION_EXPLORATION");

    recordDecision(s, { questionId: "option_explored", prompt: "What did you look at?", selectedOption: "Pixie Cut", isResolved: true });

    const after = observeState(s, OPTIONS, 3);
    expect(after.recommendedStage).toBe("PLAN_A");
    expect(selectNextAction(after)).not.toEqual(selectNextAction(before));
  });
});

describe("4 — changing Plan A triggers a Plan B consistency review", () => {
  it("asks to review Plan B when it collides with the new Plan A", () => {
    const s = sessionWith(["cost"]);
    s.plan.planA = { label: "Pixie Cut", optionId: "style_pixie", previewId: null, rationale: null };
    // Plan B was a different choice, then Plan A changed onto it.
    s.plan.planB = { label: "Pixie Cut", optionId: "style_pixie", previewId: null, rationale: null };

    const state = observeState(s, OPTIONS, 3);
    expect(state.needPlanBReview).toBe(true);
    expect(selectNextAction(state)).toMatchObject({ type: "review_plan", focus: "planB" });
  });
});

describe("5 — a scenario can be left unresolved and the plan still completes", () => {
  it("records 'undecided' as a valid, non-failure outcome", () => {
    const s = sessionWith(["comfort"]);
    s.plan.planA = { label: "Pixie Cut", optionId: "style_pixie", previewId: null, rationale: null };

    markUndecided(s, "scenario_uncomfortable", "What would you prefer instead?");

    const plan = assemblePlan(s, "mock");
    expect(plan.planA?.label).toBe("Pixie Cut");
    expect(plan.unresolved.map((d) => d.questionId)).toContain("scenario_uncomfortable");
  });
});

describe("6 — an invalid model action is rejected by validation", () => {
  it("refuses to present an option that is not in the catalogue", () => {
    const state = observeState(sessionWith(["cost"]), OPTIONS, 3, "OPTION_EXPLORATION");
    const verdict = validateAction({ type: "present_options", optionIds: ["invented_option"] }, state);

    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toBe("unknown_option");
  });
});

describe("7 — unsupported options cannot be presented as previews", () => {
  it("rejects a preview for a non-visualizable covering option", () => {
    const state = observeState(sessionWith(["familiar_appearance"], { photo: true }), OPTIONS, 3, "OPTION_EXPLORATION");
    const verdict = validateAction({ type: "propose_preview", optionId: "wig", templateId: "tpl-pixie" }, state);

    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toBe("unsupported_preview");
  });

  it("rejects a preview whose template id does not match the option", () => {
    const state = observeState(sessionWith(["familiar_appearance"], { photo: true }), OPTIONS, 3, "OPTION_EXPLORATION");
    const verdict = validateAction({ type: "propose_preview", optionId: "style_pixie", templateId: "tpl-wrong" }, state);

    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toBe("unsupported_preview");
  });
});

describe("8 — a preview needs explicit approval and respects the limit", () => {
  it("flags propose_preview as requiring user approval", () => {
    expect(requiresUserApproval(PREVIEW_OK)).toBe(true);
    expect(requiresUserApproval({ type: "present_options", optionIds: ["wig"] })).toBe(false);
  });

  it("will not propose or allow a preview once the budget is spent", () => {
    const s = sessionWith(["familiar_appearance"], { photo: true });
    s.previewBudgetUsed = 3; // max is 3
    const state = observeState(s, OPTIONS, 3, "OPTION_EXPLORATION");

    expect(state.remainingPreviews).toBe(0);
    expect(selectNextAction(state).type).not.toBe("propose_preview");
    const verdict = validateAction(PREVIEW_OK, state);
    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toBe("preview_limit_reached");
  });
});

describe("9 — every action is validated; invalid responses are refused, not persisted", () => {
  it("selects and validates a state-consistent action each turn", () => {
    const state = observeState(sessionWith(["cost"]), OPTIONS, 3, "OPTION_EXPLORATION");
    const { action, validation } = selectValidatedAction(state);
    expect(validation.ok).toBe(true);
    expect(action).toEqual(selectNextAction(state));
  });

  it("refuses to persist an answer that is not a supported scenario choice", () => {
    const s = sessionWith(["cost"]);
    s.plan.planA = { label: "Pixie Cut", optionId: "style_pixie", previewId: null, rationale: null };
    const state = observeState(s, OPTIONS, 3, "SCENARIO_REHEARSAL");
    const before = s.decisions.length;

    const res = processResponse(s, state, "scenario_uncomfortable", "What would you prefer instead?", "A made-up option");
    expect(res.validation.ok).toBe(false);
    expect(res.applied).toBe(false);
    expect(s.decisions.length).toBe(before); // nothing was mutated
  });

  it("records 'undecided' as a valid response and persists it", () => {
    const s = sessionWith(["cost"]);
    s.plan.planA = { label: "Pixie Cut", optionId: "style_pixie", previewId: null, rationale: null };
    const state = observeState(s, OPTIONS, 3, "SCENARIO_REHEARSAL");

    const res = processResponse(s, state, "scenario_uncomfortable", "What would you prefer instead?", UNDECIDED_CHOICE);
    expect(res.action.type).toBe("mark_undecided");
    expect(res.applied).toBe(true);
    expect(s.decisions.some((d) => d.questionId === "scenario_uncomfortable" && !d.isResolved)).toBe(true);
  });
});

describe("10 — the final plan reflects saved decisions, not invented ones", () => {
  it("reports only what the user actually chose", () => {
    const s = sessionWith(["comfort"]);
    s.plan.planA = { label: "Wig", optionId: "wig", previewId: null, rationale: null };

    const plan = assemblePlan(s, "mock");
    expect(plan.planA?.label).toBe("Wig");
    expect(plan.planB).toBeNull();
    expect(plan.priorities).toEqual(["comfort"]);
    expect(plan.questionsForCareTeam).toEqual([]);
  });
});

describe("11 — going back or changing a decision updates subsequent guidance", () => {
  it("recomputes the recommendation when a decision is revised or withdrawn", () => {
    const s = sessionWith(["cost"], { photo: true, analysis: true });
    recordDecision(s, { questionId: "option_explored", prompt: "p", selectedOption: "Pixie Cut", isResolved: true });
    expect(observeState(s, OPTIONS, 3).recommendedStage).toBe("PLAN_A");

    // Changing the same decision upserts in place — no duplicate history.
    recordDecision(s, { questionId: "option_explored", prompt: "p", selectedOption: "Wig", isResolved: true });
    const matches = s.decisions.filter((d) => d.questionId === "option_explored");
    expect(matches.length).toBe(1);
    expect(matches[0].selectedOption).toBe("Wig");

    // Withdrawing it (going back) moves the recommendation back too.
    s.decisions = s.decisions.filter((d) => d.questionId !== "option_explored");
    expect(observeState(s, OPTIONS, 3).recommendedStage).toBe("OPTION_EXPLORATION");
  });
});

describe("12 — the workflow runs in mock mode with no LLM and no live credentials", () => {
  it("produces a full deterministic turn and guide with no network", () => {
    const turn = runAgentTurn(sessionWith(["comfort"]), OPTIONS, "OPTION_EXPLORATION");
    expect(turn.recommendedStage).toBe("OPTION_EXPLORATION");
    expect(KNOWN_ACTIONS).toContain(turn.guidance.nextAction);
    expect(typeof turn.requiresApproval).toBe("boolean");

    const guide = buildGuide({ session: sessionWith(["comfort"]), options: OPTIONS, recommendedStage: "PLAN_A" });
    expect(guide.recommendedStage).toBe("PLAN_A");
    expect(typeof guide.action.type).toBe("string");
    expect(typeof guide.requiresApproval).toBe("boolean");
  });

  it("is deterministic: the same state always yields the same action", () => {
    const a = runAgentTurn(sessionWith(["cost"], { photo: true }), OPTIONS, "OPTION_EXPLORATION");
    const b = runAgentTurn(sessionWith(["cost"], { photo: true }), OPTIONS, "OPTION_EXPLORATION");
    expect(a.action).toEqual(b.action);
    expect(a.guidance).toEqual(b.guidance);
  });
});
