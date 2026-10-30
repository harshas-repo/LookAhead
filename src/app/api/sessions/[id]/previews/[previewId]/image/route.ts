/**
 * GET /api/sessions/[id]/previews/[previewId]/image — serve a re-hosted preview.
 *
 * Authenticated by token (header or ?token=). The preview must belong to the
 * session and have a stored output; we never serve an arbitrary path.
 */

import { NextResponse } from "next/server";
import { contentTypeForPath, readPhoto } from "@/lib/store";
import { ApiError, fromError, requireSession } from "@/lib/api/http";

export const dynamic = "force-dynamic";

type Ctx = { params: { id: string; previewId: string } };

export async function GET(request: Request, { params }: Ctx): Promise<NextResponse> {
  try {
    const { session } = await requireSession(params.id, request);
    const preview = session.previews.find((p) => p.id === params.previewId);
    if (!preview) throw new ApiError(404, "preview_not_found", "That preview isn't part of this session.");
    if (!preview.outputImageRef) throw new ApiError(404, "image_not_ready", "This preview has no image yet.");

    const bytes = await readPhoto(preview.outputImageRef);
    if (!bytes) throw new ApiError(404, "image_missing", "The stored image could not be found.");

    return new NextResponse(new Uint8Array(bytes), {
      status: 200,
      headers: {
        "content-type": contentTypeForPath(preview.outputImageRef),
        "cache-control": "private, no-store",
        "content-length": String(bytes.byteLength)
      }
    });
  } catch (err) {
    return fromError(err);
  }
}
