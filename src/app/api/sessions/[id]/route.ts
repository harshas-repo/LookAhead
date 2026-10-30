/**
 * /api/sessions/[id]
 *   GET    — load the (secret-free) session state
 *   PATCH  — update profile/preferences and/or move to a new stage
 *   DELETE — privacy reset: delete the session and all stored photos
 *
 * Every handler verifies ownership via the session token; the id alone is never
 * treated as authorization (instruction §10).
 */

import { NextResponse } from "next/server";
import { getConfig } from "@/lib/config";
import { deleteSession, saveSession } from "@/lib/store";
import { isValidTransition } from "@/lib/decision/engine";
import { updateProfileSchema } from "@/lib/validation";
import { ApiError, fromError, parseBody, providerMode, requireSession } from "@/lib/api/http";
import { publicSession } from "@/lib/api/serialize";
import type { Session } from "@/lib/types";

export const dynamic = "force-dynamic";

type Ctx = { params: { id: string } };

export async function GET(request: Request, { params }: Ctx): Promise<NextResponse> {
  try {
    const { session } = await requireSession(params.id, request);
    return NextResponse.json({
      session: publicSession(session, providerMode(), getConfig().limits.maxPreviewsPerSession)
    });
  } catch (err) {
    return fromError(err);
  }
}

export async function PATCH(request: Request, { params }: Ctx): Promise<NextResponse> {
  try {
    const { session } = await requireSession(params.id, request);
    const body = await parseBody(request, updateProfileSchema);

    if (body.priorities) session.profile.priorities = dedupePriorities(body.priorities);
    if (body.topPriorities) session.profile.topPriorities = dedupePriorities(body.topPriorities).slice(0, 2);
    if (body.optionalTreatmentDate !== undefined) {
      session.profile.optionalTreatmentDate = body.optionalTreatmentDate ?? null;
    }
    if (typeof body.consentGranted === "boolean") {
      session.profile.consent = {
        granted: body.consentGranted,
        grantedAt: body.consentGranted ? new Date().toISOString() : null
      };
    }

    if (body.currentStage && body.currentStage !== session.currentStage) {
      if (!isValidTransition(session, body.currentStage)) {
        throw new ApiError(409, "invalid_transition", "Please complete the earlier steps first.");
      }
      session.currentStage = body.currentStage;
    }

    const saved = await saveSession(session);
    return NextResponse.json({
      session: publicSession(saved, providerMode(), getConfig().limits.maxPreviewsPerSession)
    });
  } catch (err) {
    return fromError(err);
  }
}

export async function DELETE(request: Request, { params }: Ctx): Promise<NextResponse> {
  try {
    // Ownership is verified before deletion.
    await requireSession(params.id, request);
    await deleteSession(params.id);
    return NextResponse.json({ deleted: true });
  } catch (err) {
    return fromError(err);
  }
}

function dedupePriorities(list: Session["profile"]["priorities"]): Session["profile"]["priorities"] {
  return Array.from(new Set(list));
}
