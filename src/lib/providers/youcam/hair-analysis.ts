/**
 * Live YouCam Hair Length Detection adapter.
 *
 * Contract (api-feasibility.md §2.1):
 *   POST /s2s/v2.0/task/hair-length-detection   (source = uploaded file_id)
 *   GET  /s2s/v2.0/task/hair-length-detection/{task_id}  -> poll
 * Provider result strings are mapped to our stable HairLength enum so the UI
 * never depends on raw provider values.
 */

import type { HairLength } from "../../types";
import type { HairAnalysisAdapter, HairAnalysisOutcome, NormalizedPhoto } from "../types";
import { createTask, pollTask, uploadFile, YouCamError } from "./client";

const TASK_PATH = "/s2s/v2.0/task/hair-length-detection";

/** Documented provider result strings -> internal enum. */
export function mapHairLengthResult(raw: string | null): HairLength {
  if (!raw) return "unknown";
  const value = raw.trim().toLowerCase();
  if (value.includes("above the ear")) return "above_ear";
  if (value.includes("ear length")) return "ear_length";
  if (value.includes("above chest")) return "medium";
  if (value.includes("long hair")) return "long";
  if (value.includes("short hair")) return "short";
  return "unknown";
}

export class YouCamHairAnalysisAdapter implements HairAnalysisAdapter {
  readonly mode = "live" as const;

  async analyze(photo: NormalizedPhoto): Promise<HairAnalysisOutcome> {
    try {
      const fileId = await uploadFile(photo);
      const taskId = await createTask(TASK_PATH, { src_file_id: fileId });
      const result = await pollTask(TASK_PATH, taskId);

      if (result.taskStatus !== "success") {
        return {
          status: "failed",
          length: "unknown",
          rawResult: null,
          errorCode: result.errorCode || "analysis_failed"
        };
      }
      return {
        status: "success",
        length: mapHairLengthResult(result.resultString),
        rawResult: result.resultString,
        errorCode: null
      };
    } catch (err) {
      const code = err instanceof YouCamError ? err.errorCode || "provider_error" : "provider_error";
      return { status: "failed", length: "unknown", rawResult: null, errorCode: code };
    }
  }
}
