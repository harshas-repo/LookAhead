/**
 * Live YouCam Hair Type Detection adapter.
 *
 * Contract:
 *   POST /s2s/v2.0/task/hair-type-detection          { src_file_ids: [front, right, left] }
 *   GET  /s2s/v2.0/task/hair-type-detection/{task_id} -> poll
 *   -> results.hair_type.{ mapping, term }
 *
 * The three photos MUST be the SAME size — the provider rejects a mismatch with
 * `error_mismatch_image_size`. The capture pipeline normalizes every angle to a
 * fixed 768x1024 (photo.ts `normalizeToFixedTarget`) so this always holds, and
 * the order is [front, right, left]. `uploadFile` caches per fileName, so the
 * front photo already uploaded for Hair Length is reused here at no extra cost.
 * 2 units, charged only on success.
 */

import type { HairTypeAdapter, HairTypeOutcome, HairTypePhotos } from "../types";
import { createTask, pollTask, uploadFile, YouCamError } from "./client";

const TASK_PATH = "/s2s/v2.0/task/hair-type-detection";

/** Read `results.hair_type.{ mapping, term }` from a raw results object. */
export function readHairType(results: Record<string, unknown> | undefined): { mapping: string | null; term: string | null } {
  if (!results) return { mapping: null, term: null };
  const type = results.hair_type;
  if (type && typeof type === "object") {
    const rec = type as Record<string, unknown>;
    return {
      mapping: typeof rec.mapping === "string" ? rec.mapping : null,
      term: typeof rec.term === "string" ? rec.term : null
    };
  }
  return { mapping: null, term: null };
}

export class YouCamHairTypeAdapter implements HairTypeAdapter {
  readonly mode = "live" as const;

  async analyze(photos: HairTypePhotos): Promise<HairTypeOutcome> {
    try {
      const [front, right, left] = await Promise.all([
        uploadFile(photos.front),
        uploadFile(photos.right),
        uploadFile(photos.left)
      ]);
      const taskId = await createTask(TASK_PATH, { src_file_ids: [front, right, left] });
      const result = await pollTask(TASK_PATH, taskId);

      if (result.taskStatus !== "success") {
        return { status: "failed", mapping: null, term: null, errorCode: result.errorCode || "type_failed" };
      }
      const { mapping, term } = readHairType(result.results);
      return { status: "success", mapping, term, errorCode: null };
    } catch (err) {
      const code = err instanceof YouCamError ? err.errorCode || "provider_error" : "provider_error";
      return { status: "failed", mapping: null, term: null, errorCode: code };
    }
  }
}
