/**
 * POST /api/sessions/[id]/guide — the deterministic guide.
 *
 * Structured state goes in; a validated, constrained response comes out. Guidance
 * is produced by the deterministic loop (no LLM, no network), so this endpoint
 * always returns usable guidance driven by what the engine says is outstanding.
 */

import { NextResponse } from "next/server";
import { getOptions } from "@/lib/decision/catalog";
import { suggestNextStage } from "@/lib/decision/engine";
import { buildGuide } from "@/lib/guide";
import { guideRequestSchema } from "@/lib/validation";
import { fromError, parseBody, providerMode, requireSession } from "@/lib/api/http";

export const dynamic = "force-dynamic";

type Ctx = { params: { id: string } };

export async function POST(request: Request, { params }: Ctx): Promise<NextResponse> {
  try {
    const { session } = await requireSession(params.id, request);
    // The client's stage is only a hint; guidance is driven by what the engine says
    // is genuinely outstanding, so it adapts as decisions are recorded (audit §4).
    await parseBody(request, guideRequestSchema).catch(() => null);
    const mode = providerMode();

    const recommendedStage = suggestNextStage(session);
    const options = await getOptions(session.profile.priorities, mode);

    const guide = buildGuide({ session, options, recommendedStage });
    return NextResponse.json({ guide, mode });
  } catch (err) {
    return fromError(err);
  }
}
