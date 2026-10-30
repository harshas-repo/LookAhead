/**
 * Deterministic decision engine (instruction §7A, tech-implementation.md §5).
 *
 * Owns the workflow state machine, transition validation, priority-driven next
 * steps, and final plan assembly. It is pure and side-effect free so it can be
 * unit-tested without a server or a database. The guide sits ON TOP of these rules
 * and can never override them.
 */

import type { Decision, HairLength, Preview, Session, Stage } from "../types";
import { hairRecordSegments, type HairRecordSegment } from "../labels";

/** Linear order of the journey. */
export const STAGE_ORDER: Stage[] = [
  "START",
  "PROFILE",
  "PHOTO_CAPTURE",
  "HAIR_ANALYSIS",
  "PREPARATION",
  "OPTION_EXPLORATION",
  "PLAN_A",
  "SCENARIO_REHEARSAL",
  "PLAN_B",
  "PLAN_REVIEW",
  "COMPLETE"
];

export function stageIndex(stage: Stage): number {
  return STAGE_ORDER.indexOf(stage);
}

/** Is a given stage's completion condition satisfied? */
export function isStageComplete(session: Session, stage: Stage): boolean {
  switch (stage) {
    case "START":
      return true;
    case "PROFILE":
      return session.profile.priorities.length > 0;
    case "PHOTO_CAPTURE":
      return session.hairRecord.photoRef !== null;
    case "HAIR_ANALYSIS": {
      const a = session.hairRecord.analysis;
      return a !== null && (a.status === "success" || a.status === "failed" || a.status === "skipped");
    }
    case "PREPARATION":
      // Informational — never blocks progress.
      return true;
    case "OPTION_EXPLORATION":
      return session.previews.length > 0 || session.decisions.some((d) => d.questionId.startsWith("option_"));
    case "PLAN_A":
      return session.plan.planA !== null;
    case "SCENARIO_REHEARSAL":
      return session.decisions.some((d) => d.questionId.startsWith("scenario_"));
    case "PLAN_B":
      return session.plan.planB !== null;
    case "PLAN_REVIEW":
      return true;
    case "COMPLETE":
      return true;
    default:
      return false;
  }
}

/**
 * Validate a requested transition. Users may always move BACK (edit/skip) or ONE
 * step forward. Larger forward jumps are allowed only when every prerequisite
 * stage is complete — this prevents skipping Plan A before it exists, while still
 * letting people move freely once requirements are met.
 */
export function isValidTransition(session: Session, to: Stage): boolean {
  const from = stageIndex(session.currentStage);
  const target = stageIndex(to);
  if (target < 0) return false;
  if (target <= from) return true; // back navigation / re-edit
  if (target === from + 1) return true; // next step

  // Forward jump: all stages before the target must be complete.
  for (let i = 0; i < target; i++) {
    const stage = STAGE_ORDER[i];
    if (stage === "PHOTO_CAPTURE" || stage === "HAIR_ANALYSIS") {
      // Photo/analysis are optional — a skipped analysis counts as satisfied.
      const analysis = session.hairRecord.analysis;
      const photoDone = session.hairRecord.photoRef !== null;
      const analysisDone = analysis !== null && ["success", "failed", "skipped"].includes(analysis.status);
      if (!photoDone && !analysisDone) return false;
      continue;
    }
    if (!isStageComplete(session, stage)) return false;
  }
  return true;
}

/** The next stage the user should be guided to, based on what's still missing. */
export function suggestNextStage(session: Session): Stage {
  const start = stageIndex(session.currentStage);
  for (let i = start + 1; i < STAGE_ORDER.length; i++) {
    const stage = STAGE_ORDER[i];
    if (stage === "COMPLETE") return "COMPLETE";
    if (!isStageComplete(session, stage)) return stage;
  }
  return "COMPLETE";
}

/** Advance to the next stage if the current one is complete. Returns the new stage. */
export function advance(session: Session): Stage {
  if (session.currentStage === "COMPLETE") return "COMPLETE";
  return suggestNextStage(session);
}

/** Human-readable label for a hair-length category. */
export function hairLengthLabel(length: HairLength | null | undefined): string {
  switch (length) {
    case "above_ear":
      return "Above the ear";
    case "ear_length":
      return "Ear length";
    case "short":
      return "Short";
    case "medium":
      return "Medium (around the collarbone)";
    case "long":
      return "Long";
    default:
      return "Not detected";
  }
}

/** The final structured plan used by the printable page and the /plan response. */
export interface PlanSummary {
  createdAt: string;
  priorities: Session["profile"]["priorities"];
  topPriorities: Session["profile"]["topPriorities"];
  optionalTreatmentDate: string | null;
  hairRecord: {
    detected: string | null;
    userCorrected: string | null;
    finalLabel: string;
    source: "api" | "user" | "none";
    providerMode: "mock" | "live";
    /** The composed warm sentence (length + density + type), API values bolded. */
    sentence: string;
    segments: HairRecordSegment[];
  } | null;
  planA: { label: string; optionId: string | null; imageUrl: string | null; preview: Preview | null } | null;
  planB: { label: string; optionId: string | null; imageUrl: string | null; preview: Preview | null } | null;
  unresolved: Decision[];
  questionsForCareTeam: string[];
  previewCount: number;
}

function findPreview(session: Session, previewId: string | null): Preview | null {
  if (!previewId) return null;
  return session.previews.find((p) => p.id === previewId) ?? null;
}

/** Assemble the plan from ACTUAL user choices only — never invent content. */
export function assemblePlan(session: Session, providerMode: "mock" | "live"): PlanSummary {
  const analysis = session.hairRecord.analysis;
  const density = session.hairRecord.density;
  const type = session.hairRecord.type;
  const detected = analysis && analysis.status === "success" ? hairLengthLabel(analysis.length) : null;
  const corrected = analysis?.userCorrection ? hairLengthLabel(analysis.userCorrection) : null;
  const finalLabel = corrected ?? detected ?? null;

  // The record exists as soon as ANY detection has been attempted, so density- or
  // type-only runs still surface their sentence (never invent what wasn't detected).
  const segments = hairRecordSegments({ length: analysis, density, type });
  const sentence = segments.map((s) => s.text).join("");

  const hairRecord =
    analysis || density || type
      ? {
          detected,
          userCorrected: corrected,
          finalLabel: finalLabel ?? "Not recorded",
          source: (corrected ? "user" : detected ? "api" : "none") as "api" | "user" | "none",
          providerMode,
          sentence,
          segments
        }
      : null;

  const unresolved = session.decisions.filter((d) => !d.isResolved);

  return {
    createdAt: new Date().toISOString(),
    priorities: session.profile.priorities,
    topPriorities: session.profile.topPriorities,
    optionalTreatmentDate: session.profile.optionalTreatmentDate,
    hairRecord,
    planA: session.plan.planA
      ? {
          label: session.plan.planA.label,
          optionId: session.plan.planA.optionId,
          imageUrl: session.plan.planA.imageUrl ?? null,
          preview: findPreview(session, session.plan.planA.previewId)
        }
      : null,
    planB: session.plan.planB
      ? {
          label: session.plan.planB.label,
          optionId: session.plan.planB.optionId,
          imageUrl: session.plan.planB.imageUrl ?? null,
          preview: findPreview(session, session.plan.planB.previewId)
        }
      : null,
    unresolved,
    questionsForCareTeam: session.plan.questionsForCareTeam,
    previewCount: session.previews.filter((p) => p.status === "success").length
  };
}
