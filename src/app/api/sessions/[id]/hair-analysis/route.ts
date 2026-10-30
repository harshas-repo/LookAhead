/**
 * /api/sessions/[id]/hair-analysis
 *   POST  — run the hair-record detections in parallel: Hair Length (front photo),
 *           Hair Density (lowered-head angle), and Hair Type (front+right+left).
 *           Each detection runs only when it has inputs AND no prior success, so a
 *           re-run never re-charges, and each stores its own result independently —
 *           a timeout/failure in one degrades just that part, never the whole record.
 *   PATCH — confirm / correct / skip the detected hair length
 *
 * The results are a description of the hair in the photo TODAY, never a prediction
 * of future change (scope.md). The user can always correct the length, and the
 * correction is what the plan reports (instruction §12).
 */

import { NextResponse } from "next/server";
import { getHairAnalysisAdapter, getHairDensityAdapter, getHairTypeAdapter } from "@/lib/providers";
import { readPhoto, saveSession } from "@/lib/store";
import { hairAnalysisCorrectionSchema, hairAnalysisRequestSchema } from "@/lib/validation";
import { ApiError, fromError, parseBody, providerMode, requireSession } from "@/lib/api/http";
import { requireAccess } from "@/lib/access";
import { publicSession } from "@/lib/api/serialize";
import { getConfig } from "@/lib/config";
import type { NormalizedPhoto } from "@/lib/providers/types";
import type { PhotoRef, Session } from "@/lib/types";

export const dynamic = "force-dynamic";

type Ctx = { params: { id: string } };

/** Load a stored photo ref into the normalized shape the adapters expect. */
async function loadPhotoByRef(ref: PhotoRef | null | undefined): Promise<NormalizedPhoto | null> {
  if (!ref) return null;
  const bytes = await readPhoto(ref.storedPath);
  if (!bytes) return null;
  return { bytes, contentType: "image/jpeg", fileName: `${ref.id}.jpg` };
}

function respond(session: Session): NextResponse {
  return NextResponse.json({
    session: publicSession(session, providerMode(), getConfig().limits.maxPreviewsPerSession)
  });
}

export async function POST(request: Request, { params }: Ctx): Promise<NextResponse> {
  try {
    const { session } = await requireSession(params.id, request);
    requireAccess(request);
    const body = await parseBody(request, hairAnalysisRequestSchema);
    const hr = session.hairRecord;

    // If the caller named a specific photo, it must still be the current front photo.
    if (body.photoRefId && hr.photoRef?.id !== body.photoRefId) {
      throw new ApiError(409, "photo_mismatch", "That photo doesn't match the current session photo.");
    }
    if (!hr.photoRef) {
      throw new ApiError(409, "no_photo", "Add a photo before running the hair record.");
    }

    // Load each input once. The front photo is shared by Length and Type, and the
    // client's uploadFile caches per fileName, so it is only sent to the provider once.
    const [frontPhoto, rightPhoto, leftPhoto, densityPhoto] = await Promise.all([
      loadPhotoByRef(hr.photoRef),
      loadPhotoByRef(hr.anglePhotos?.right),
      loadPhotoByRef(hr.anglePhotos?.left),
      loadPhotoByRef(hr.anglePhotos?.density)
    ]);

    // Run whichever detections have inputs AND no prior success, in parallel. Each
    // adapter catches provider errors (including a poll timeout) and returns a
    // `failed` outcome, so one detection never blocks the others; allSettled is a
    // backstop so an unexpected throw can't reject the whole request.
    const detections: Array<Promise<void>> = [];

    if (frontPhoto && hr.analysis?.status !== "success") {
      detections.push(
        (async () => {
          const adapter = getHairAnalysisAdapter();
          const o = await adapter.analyze(frontPhoto);
          hr.analysis = {
            provider: adapter.mode === "live" ? "youcam-hair-length" : "mock-hair-length",
            length: o.length,
            rawResult: o.rawResult,
            userCorrection: hr.analysis?.userCorrection ?? null,
            status: o.status,
            errorCode: o.errorCode,
            analyzedAt: new Date().toISOString()
          };
        })()
      );
    }

    if (densityPhoto && hr.density?.status !== "success") {
      detections.push(
        (async () => {
          const adapter = getHairDensityAdapter();
          const o = await adapter.analyze(densityPhoto);
          hr.density = {
            provider: adapter.mode === "live" ? "youcam-hair-density" : "mock-hair-density",
            term: o.term,
            rawResult: o.rawResult,
            status: o.status,
            errorCode: o.errorCode,
            analyzedAt: new Date().toISOString()
          };
        })()
      );
    }

    if (frontPhoto && rightPhoto && leftPhoto && hr.type?.status !== "success") {
      detections.push(
        (async () => {
          const adapter = getHairTypeAdapter();
          const o = await adapter.analyze({ front: frontPhoto, right: rightPhoto, left: leftPhoto });
          hr.type = {
            provider: adapter.mode === "live" ? "youcam-hair-type" : "mock-hair-type",
            mapping: o.mapping,
            term: o.term,
            status: o.status,
            errorCode: o.errorCode,
            analyzedAt: new Date().toISOString()
          };
        })()
      );
    }

    await Promise.allSettled(detections);

    session.currentStage = "HAIR_ANALYSIS";
    const saved = await saveSession(session);
    return respond(saved);
  } catch (err) {
    return fromError(err);
  }
}

export async function PATCH(request: Request, { params }: Ctx): Promise<NextResponse> {
  try {
    const { session } = await requireSession(params.id, request);
    const body = await parseBody(request, hairAnalysisCorrectionSchema);

    if (body.action === "skip") {
      session.hairRecord.analysis = session.hairRecord.analysis
        ? { ...session.hairRecord.analysis, status: "skipped" }
        : {
            provider: providerMode() === "live" ? "youcam-hair-length" : "mock-hair-length",
            length: "unknown",
            rawResult: null,
            userCorrection: null,
            status: "skipped",
            errorCode: null,
            analyzedAt: new Date().toISOString()
          };
    } else if (body.action === "confirm") {
      if (!session.hairRecord.analysis) throw new ApiError(409, "no_analysis", "Nothing to confirm yet.");
      session.hairRecord.analysis.userCorrection = null;
    } else if (body.action === "correct") {
      if (!body.correctedLength) throw new ApiError(400, "missing_correction", "Choose the length that matches.");
      if (!session.hairRecord.analysis) {
        session.hairRecord.analysis = {
          provider: providerMode() === "live" ? "youcam-hair-length" : "mock-hair-length",
          length: body.correctedLength,
          rawResult: null,
          userCorrection: body.correctedLength,
          status: "success",
          errorCode: null,
          analyzedAt: new Date().toISOString()
        };
      } else {
        session.hairRecord.analysis.userCorrection = body.correctedLength;
        if (session.hairRecord.analysis.status === "skipped") session.hairRecord.analysis.status = "success";
      }
    }

    session.currentStage = "HAIR_ANALYSIS";
    const saved = await saveSession(session);
    return respond(saved);
  } catch (err) {
    return fromError(err);
  }
}
