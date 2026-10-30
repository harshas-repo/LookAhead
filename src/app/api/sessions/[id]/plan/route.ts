/**
 * /api/sessions/[id]/plan — read and update the final plan.
 *
 * GET   -> the assembled, print-ready PlanSummary (real choices only).
 * PATCH -> set/clear Plan A, Plan B, and care-team questions.
 *
 * Plan B and scenario answers are always optional: clearing a slot is a valid,
 * first-class action, and the summary reports exactly what the user chose without
 * inventing anything. Stage only ever moves FORWARD here, so editing an earlier
 * choice never yanks the user backwards through the journey.
 */

import { NextResponse } from "next/server";
import { applyPlanPatch } from "@/lib/agent/execute";
import { assemblePlan } from "@/lib/decision/engine";
import { fromError, parseBody, providerMode, requireSession } from "@/lib/api/http";
import { publicSession } from "@/lib/api/serialize";
import { saveSession } from "@/lib/store";
import { getConfig } from "@/lib/config";
import { planUpdateSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

type Ctx = { params: { id: string } };

export async function GET(request: Request, { params }: Ctx): Promise<NextResponse> {
  try {
    const { session } = await requireSession(params.id, request);
    const plan = assemblePlan(session, providerMode());
    return NextResponse.json({ plan });
  } catch (err) {
    return fromError(err);
  }
}

export async function PATCH(request: Request, { params }: Ctx): Promise<NextResponse> {
  try {
    const { session } = await requireSession(params.id, request);
    const body = await parseBody(request, planUpdateSchema);

    // Shared handler with the agent (execute.ts): `undefined` leaves a slot as-is,
    // `null` clears it, and stage only ever moves forward.
    applyPlanPatch(session, body);

    const saved = await saveSession(session);
    const plan = assemblePlan(saved, providerMode());
    return NextResponse.json({
      plan,
      session: publicSession(saved, providerMode(), getConfig().limits.maxPreviewsPerSession)
    });
  } catch (err) {
    return fromError(err);
  }
}
