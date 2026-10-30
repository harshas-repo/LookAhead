/**
 * GET /api/sessions/[id]/photos/[photoId]/image — serve the user's stored photo.
 *
 * Authenticated by the session token (header or ?token=, the latter so an <img>
 * can load it). The photoId must match one of the session's own photos — the front
 * photo or any guided angle (right/left/density); we never serve arbitrary paths
 * (no path traversal — we look the ref up on the session).
 */

import { NextResponse } from "next/server";
import { readPhoto } from "@/lib/store";
import { ApiError, fromError, requireSession } from "@/lib/api/http";
import type { PhotoRef } from "@/lib/types";

export const dynamic = "force-dynamic";

type Ctx = { params: { id: string; photoId: string } };

export async function GET(request: Request, { params }: Ctx): Promise<NextResponse> {
  try {
    const { session } = await requireSession(params.id, request);
    const hr = session.hairRecord;
    const angles = hr.anglePhotos ?? { right: null, left: null, density: null };
    const ref = [hr.photoRef, angles.right, angles.left, angles.density].find(
      (r): r is PhotoRef => Boolean(r) && (r as PhotoRef).id === params.photoId
    );
    if (!ref) {
      throw new ApiError(404, "photo_not_found", "That photo isn't part of this session.");
    }
    const bytes = await readPhoto(ref.storedPath);
    if (!bytes) throw new ApiError(404, "photo_missing", "The stored photo could not be found.");

    return new NextResponse(new Uint8Array(bytes), {
      status: 200,
      headers: {
        "content-type": "image/jpeg",
        "cache-control": "private, no-store",
        "content-length": String(bytes.byteLength)
      }
    });
  } catch (err) {
    return fromError(err);
  }
}
