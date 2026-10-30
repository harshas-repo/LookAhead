/**
 * POST /api/sessions/[id]/previews — start a hairstyle preview (VTO).
 *
 * Server-enforced rules (instruction §6):
 *   - templateId MUST exist in the provider catalog (never invented),
 *   - duplicates are NOT charged (we reuse a prior success — or an in-flight
 *     task — for the same template + photo),
 *   - a new attempt consumes one unit of budget up front; the budget itself is
 *     unlimited by default (MAX_PREVIEWS_PER_SESSION=0) and only enforced when
 *     a positive cap is configured,
 *   - failed requests are never auto-retried here.
 *
 * The task is created and stored as "processing"; the client then polls the
 * preview by id. This mirrors the provider's async task model.
 */

import { NextResponse } from "next/server";
import { getTryOnAdapter } from "@/lib/providers";
import { getCatalog } from "@/lib/decision/catalog";
import { checkPreviewBudget, findInFlightPreview, findReusablePreview } from "@/lib/decision/limits";
import { generateId, getSession, readPhoto, saveSession, withSessionLock } from "@/lib/store";
import { previewRequestSchema } from "@/lib/validation";
import { ApiError, fromError, parseBody, providerMode, requireSession } from "@/lib/api/http";
import { requireAccess } from "@/lib/access";
import { publicPreview } from "@/lib/api/serialize";
import { getConfig } from "@/lib/config";
import type { Preview, Session } from "@/lib/types";

export const dynamic = "force-dynamic";

type Ctx = { params: { id: string } };

export async function POST(request: Request, { params }: Ctx): Promise<NextResponse> {
  try {
    const { session } = await requireSession(params.id, request);
    requireAccess(request);
    const body = await parseBody(request, previewRequestSchema);
    const cfg = getConfig();
    const mode = providerMode();

    if (session.hairRecord.photoRef?.id !== body.photoRefId) {
      throw new ApiError(409, "photo_mismatch", "That photo doesn't match the current session photo.");
    }

    // 1) Verify the template exists in the combined provider catalog and read its
    //    family — never invent IDs, and the family selects the right try-on endpoint
    //    (hairstyle / extension / bangs / volume all share the create + poll shape).
    const templates = await getCatalog(mode);
    const template = templates.find((t) => t.templateId === body.templateId);
    if (!template) {
      throw new ApiError(400, "unknown_template", "That look isn't available. Please pick another.");
    }
    const family = template.family;

    // 2) Reuse a prior successful preview for the same template + family + photo.
    const existing = findReusablePreview(session, body.templateId, body.photoRefId, family);
    if (existing) {
      return NextResponse.json({ preview: publicPreview(session.id, existing), reused: true });
    }

    // 2b) Block a duplicate submission while the same task is still generating
    //     (api-feasibility.md §5). A second click / second tab / client retry must
    //     NOT create — and pay for — a second identical task. We hand back the
    //     in-flight preview (uncharged) so the caller keeps polling the same task.
    const inFlight = findInFlightPreview(session, body.templateId, body.photoRefId, family);
    if (inFlight) {
      return NextResponse.json({ preview: publicPreview(session.id, inFlight), reused: true });
    }

    // 3) Budget check — inert by default (unlimited). It only fires when a
    //    positive MAX_PREVIEWS_PER_SESSION is configured as a cost escape hatch.
    const budget = checkPreviewBudget(session.previewBudgetUsed, cfg.limits.maxPreviewsPerSession);
    if (!budget.allowed) {
      throw new ApiError(
        429,
        "preview_limit_reached",
        `You've used all ${cfg.limits.maxPreviewsPerSession} previews for this session. You can still browse the other looks or finalize your plan.`
      );
    }

    // 4) Load the photo and create the provider task with the family's adapter.
    //    This slow provider call runs OUTSIDE the session lock, so a parallel
    //    "Preview all" batch genuinely starts every task at the same time.
    const ref = session.hairRecord.photoRef!;
    const bytes = await readPhoto(ref.storedPath);
    if (!bytes) throw new ApiError(404, "photo_missing", "The stored photo could not be found.");

    const adapter = getTryOnAdapter(family);
    const { taskId } = await adapter.createPreview(
      { bytes, contentType: "image/jpeg", fileName: `${ref.id}.jpg` },
      template.templateId
    );

    const preview: Preview = {
      id: generateId("prev"),
      templateId: template.templateId,
      displayName: template.displayName,
      family,
      inputPhotoRefId: ref.id,
      taskId,
      outputImageRef: null,
      status: "processing",
      errorCode: null,
      charged: true,
      createdAt: new Date().toISOString()
    };

    // 5) Persist atomically. The store is a whole-file read-modify-write, so we
    //    re-read the LATEST session inside a per-session lock before pushing —
    //    otherwise concurrent creates each save a stale copy and clobber the others,
    //    orphaning previews the client is already polling (they'd 404 forever).
    const saved = await withSessionLock(session.id, async () => {
      const fresh = (await getSession(session.id)) ?? session;
      fresh.previews.push(preview);
      fresh.previewBudgetUsed += 1;
      if (stageIsBeforeExploration(fresh.currentStage)) fresh.currentStage = "OPTION_EXPLORATION";
      return saveSession(fresh);
    });

    return NextResponse.json(
      {
        preview: publicPreview(saved.id, preview),
        reused: false,
        previewBudgetUsed: saved.previewBudgetUsed,
        previewBudgetMax: cfg.limits.maxPreviewsPerSession
      },
      { status: 202 }
    );
  } catch (err) {
    return fromError(err);
  }
}

function stageIsBeforeExploration(stage: Session["currentStage"]): boolean {
  const order: Session["currentStage"][] = [
    "START",
    "PROFILE",
    "PHOTO_CAPTURE",
    "HAIR_ANALYSIS",
    "PREPARATION"
  ];
  return order.includes(stage);
}
