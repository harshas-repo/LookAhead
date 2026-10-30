/**
 * GET /api/sessions/[id]/options — curated, priority-ordered appearance options
 * plus the current rehearsal scenario and a simple deterministic recommendation.
 *
 * EVERY option is visualizable now: the four try-on families (hairstyle, extension,
 * bangs, volume) all render a preview, bound to REAL provider template IDs. The
 * recommendation only reorders + annotates (highlighted first) — it never removes
 * choices. The scenario is chosen deterministically from Plan A.
 */

import { NextResponse } from "next/server";
import { getOptions } from "@/lib/decision/catalog";
import { orderOptions } from "@/lib/decision/options";
import { recommend } from "@/lib/decision/recommend";
import { buildScenarioChoices, selectScenario } from "@/lib/decision/scenarios";
import { fromError, providerMode, requireSession } from "@/lib/api/http";
import { getConfig } from "@/lib/config";

export const dynamic = "force-dynamic";

type Ctx = { params: { id: string } };

export async function GET(request: Request, { params }: Ctx): Promise<NextResponse> {
  try {
    const { session } = await requireSession(params.id, request);
    const mode = providerMode();
    const priorities = session.profile.priorities;
    const options = await getOptions(priorities, mode);

    // Simple, deterministic recommendation from what the user told us + the hair
    // record. Only successful detections feed it; a partial record still works.
    const analysis = session.hairRecord.analysis;
    const densityResult = session.hairRecord.density;
    const typeResult = session.hairRecord.type;
    const recommendation = recommend({
      options,
      priorities,
      topPriorities: session.profile.topPriorities,
      treatmentDate: session.profile.optionalTreatmentDate,
      length: analysis && analysis.status === "success" ? analysis.userCorrection ?? analysis.length : null,
      density: densityResult && densityResult.status === "success" ? densityResult.term : null,
      type: typeResult && typeResult.status === "success" ? typeResult.term : null
    });
    const ordered = orderOptions(options, priorities, recommendation);

    const used = new Set(
      session.decisions
        .filter((d) => d.questionId.startsWith("scenario_"))
        .map((d) => d.questionId.replace(/^scenario_/, ""))
    );
    const scenario = selectScenario(session.plan.planA, used);

    return NextResponse.json({
      mode,
      options: ordered,
      recommendation,
      scenario: {
        id: scenario.id,
        situation: scenario.situation,
        question: scenario.question,
        decisionQuestionId: scenario.decisionQuestionId,
        choices: buildScenarioChoices(ordered, session.plan.planA)
      },
      previewBudgetUsed: session.previewBudgetUsed,
      previewBudgetMax: getConfig().limits.maxPreviewsPerSession
    });
  } catch (err) {
    return fromError(err);
  }
}
