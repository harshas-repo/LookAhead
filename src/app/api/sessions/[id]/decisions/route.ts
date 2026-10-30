/**
 * POST /api/sessions/[id]/decisions — record (or update) a decision.
 *
 * Decisions are upserted by questionId so a user can change their mind without
 * duplicating history. Leaving something unresolved is a first-class, valid
 * outcome (isResolved: false) — the plan reports these honestly rather than
 * forcing an answer.
 */

import { NextResponse } from "next/server";
import { recordDecision } from "@/lib/agent/execute";
import { saveSession } from "@/lib/store";
import { decisionSchema } from "@/lib/validation";
import { fromError, parseBody, providerMode, requireSession } from "@/lib/api/http";
import { publicSession } from "@/lib/api/serialize";
import { getConfig } from "@/lib/config";

export const dynamic = "force-dynamic";

type Ctx = { params: { id: string } };

export async function POST(request: Request, { params }: Ctx): Promise<NextResponse> {
  try {
    const { session } = await requireSession(params.id, request);
    const body = await parseBody(request, decisionSchema);

    // Shared handler with the agent (execute.ts) so route + agent never drift.
    recordDecision(session, {
      questionId: body.questionId,
      prompt: body.prompt,
      selectedOption: body.selectedOption ?? null,
      isResolved: body.isResolved,
      note: body.note ?? null
    });
    const record = session.decisions.find((d) => d.questionId === body.questionId)!;

    const saved = await saveSession(session);
    return NextResponse.json({
      decision: record,
      session: publicSession(saved, providerMode(), getConfig().limits.maxPreviewsPerSession)
    });
  } catch (err) {
    return fromError(err);
  }
}
