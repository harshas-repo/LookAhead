/**
 * GET /api/sessions/[id]/previews/[previewId] — poll a preview task.
 *
 * On success we RE-HOST the provider result on our own disk. Live provider URLs
 * expire quickly (ttl30 — api-feasibility.md §5), so storing bytes keeps the plan
 * and the printable page stable. Terminal states are cached: once success/failed,
 * repeated polls return the same result without touching the provider again.
 */

import { NextResponse } from "next/server";
import { getTryOnAdapter } from "@/lib/providers";
import { downloadBytes } from "@/lib/providers/youcam/client";
import { getSession, saveSession, storePhoto, withSessionLock } from "@/lib/store";
import { ApiError, fromError, requireSession } from "@/lib/api/http";
import { publicPreview } from "@/lib/api/serialize";

export const dynamic = "force-dynamic";

type Ctx = { params: { id: string; previewId: string } };

function detectExt(bytes: Buffer): "jpg" | "png" | "svg" {
  if (bytes.length > 2 && bytes[0] === 0xff && bytes[1] === 0xd8) return "jpg";
  if (bytes.length > 2 && bytes[0] === 0x89 && bytes[1] === 0x50) return "png";
  const head = bytes.subarray(0, 256).toString("utf8").trimStart();
  if (head.startsWith("<")) return "svg";
  return "jpg";
}

export async function GET(request: Request, { params }: Ctx): Promise<NextResponse> {
  try {
    const { session } = await requireSession(params.id, request);
    const preview = session.previews.find((p) => p.id === params.previewId);
    if (!preview) throw new ApiError(404, "preview_not_found", "That preview isn't part of this session.");

    // Terminal state — return the cached result, no provider call.
    if (preview.status !== "processing") {
      return NextResponse.json({ preview: publicPreview(session.id, preview) });
    }
    if (!preview.taskId) {
      const updated = await withSessionLock(session.id, async () => {
        const fresh = (await getSession(session.id)) ?? session;
        const fp = fresh.previews.find((p) => p.id === params.previewId);
        if (fp && fp.status === "processing") {
          fp.status = "failed";
          fp.errorCode = "no_task";
        }
        await saveSession(fresh);
        return fp ?? preview;
      });
      return NextResponse.json({ preview: publicPreview(session.id, updated) });
    }

    const adapter = getTryOnAdapter(preview.family);
    // The slow provider status check and result download run OUTSIDE the lock so
    // parallel polls overlap; only the session read-modify-write is serialized.
    const outcome = await adapter.getPreview(preview.taskId);
    let bytes: Buffer | null = outcome.resultBytes ?? null;
    if (outcome.status === "success" && !bytes && outcome.resultUrl) {
      // The provider URL is short-lived (ttl30 / signed ~2h). If it already expired
      // or is unreachable, fail cleanly instead of throwing a 500 the client would
      // silently retry forever.
      try {
        bytes = await downloadBytes(outcome.resultUrl);
      } catch {
        bytes = null;
      }
    }

    const updated = await withSessionLock(session.id, async () => {
      const fresh = (await getSession(session.id)) ?? session;
      const fp = fresh.previews.find((p) => p.id === params.previewId);
      if (!fp) return null;
      // Another poll may have already finalized it — never redo work or overwrite a
      // terminal result (this also makes concurrent polls of the same id idempotent).
      if (fp.status !== "processing") return fp;
      if (outcome.status === "success") {
        if (!bytes) {
          fp.status = "failed";
          fp.errorCode = "empty_result";
        } else {
          const ext = detectExt(bytes);
          const rel = await storePhoto(`out_${fp.id}`, bytes, ext);
          fp.outputImageRef = rel;
          fp.status = "success";
          fp.errorCode = null;
        }
      } else if (outcome.status === "failed") {
        fp.status = "failed";
        fp.errorCode = outcome.errorCode || "preview_failed";
      }
      // processing → leave unchanged; the client keeps polling.
      await saveSession(fresh);
      return fp;
    });

    if (!updated) throw new ApiError(404, "preview_not_found", "That preview isn't part of this session.");
    return NextResponse.json({ preview: publicPreview(session.id, updated) });
  } catch (err) {
    return fromError(err);
  }
}
