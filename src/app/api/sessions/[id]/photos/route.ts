/**
 * POST /api/sessions/[id]/photos — store a normalized photo for this session.
 *
 * The client sends the SHARED normalized pipeline output (JPEG) as multipart
 * form-data. This single endpoint is used by BOTH the upload path and the camera
 * path, so a camera-captured photo follows the exact same analysis/visualization
 * pipeline as an uploaded one (instruction §5).
 *
 * An optional `angle` field routes the photo into the right slot of the multi-angle
 * hair record:
 *   front (default) -> hairRecord.photoRef   (Hair Length + every try-on preview)
 *   right | left    -> hairRecord.anglePhotos (with front, feeds Hair Type)
 *   density         -> hairRecord.anglePhotos.density (feeds Hair Density)
 * Storing a photo clears only the detection(s) that photo feeds, so a retake never
 * silently keeps a stale result.
 *
 * The server re-validates that the payload is a JPEG within the size limit and keeps
 * bytes on disk (never in the session row).
 */

import { NextResponse } from "next/server";
import { generateId, saveSession, storePhoto } from "@/lib/store";
import { ApiError, fromError, providerMode, requireSession } from "@/lib/api/http";
import { publicSession } from "@/lib/api/serialize";
import { getConfig } from "@/lib/config";

export const dynamic = "force-dynamic";

const MAX_BYTES = 10 * 1024 * 1024;

const ANGLES = ["front", "right", "left", "density"] as const;
type Angle = (typeof ANGLES)[number];

type Ctx = { params: { id: string } };

function isJpeg(bytes: Buffer): boolean {
  return bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}

/** Omitted/empty means the primary front photo; an unknown value is rejected. */
function parseAngle(value: FormDataEntryValue | null): Angle {
  if (value === null || typeof value !== "string" || value.trim() === "") return "front";
  const v = value.trim().toLowerCase();
  if ((ANGLES as readonly string[]).includes(v)) return v as Angle;
  throw new ApiError(400, "invalid_angle", "That photo angle isn't recognized.");
}

export async function POST(request: Request, { params }: Ctx): Promise<NextResponse> {
  try {
    const { session } = await requireSession(params.id, request);

    if (!session.profile.consent.granted) {
      throw new ApiError(403, "consent_required", "Please confirm you're happy to add a photo first.");
    }

    const form = await request.formData();
    const file = form.get("photo");
    if (!file || typeof file === "string") {
      throw new ApiError(400, "missing_photo", "No photo was included in the request.");
    }
    const angle = parseAngle(form.get("angle"));

    const width = Number(form.get("width") ?? 0);
    const height = Number(form.get("height") ?? 0);
    if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
      throw new ApiError(400, "invalid_dimensions", "Photo dimensions look invalid.");
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    if (bytes.byteLength === 0) throw new ApiError(400, "empty_photo", "The photo was empty.");
    if (bytes.byteLength > MAX_BYTES) throw new ApiError(413, "photo_too_large", "That photo is too large.");
    if (!isJpeg(bytes)) {
      throw new ApiError(415, "unsupported_type", "Please send a JPEG image (the app normalizes photos automatically).");
    }

    const id = generateId("photo");
    const storedPath = await storePhoto(id, bytes, "jpg");
    const ref = { id, storedPath, width, height, createdAt: new Date().toISOString() };

    if (angle === "front") {
      session.hairRecord.photoRef = ref;
      // A new front photo invalidates the length analysis (and every preview reuses it).
      session.hairRecord.analysis = null;
      if (session.currentStage === "START" || session.currentStage === "PROFILE") {
        session.currentStage = "PHOTO_CAPTURE";
      }
    } else if (angle === "density") {
      session.hairRecord.anglePhotos.density = ref;
      session.hairRecord.density = null;
    } else {
      // right | left feed Hair Type (with the front photo).
      session.hairRecord.anglePhotos[angle] = ref;
      session.hairRecord.type = null;
    }

    const saved = await saveSession(session);
    return NextResponse.json(
      { session: publicSession(saved, providerMode(), getConfig().limits.maxPreviewsPerSession) },
      { status: 201 }
    );
  } catch (err) {
    return fromError(err);
  }
}
