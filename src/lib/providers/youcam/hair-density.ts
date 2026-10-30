/**
 * Live YouCam Hair Density Detection adapter.
 *
 * Contract:
 *   POST /s2s/v2.0/task/hair-density-detection          { src_file_id }
 *   GET  /s2s/v2.0/task/hair-density-detection/{task_id} -> poll
 *   -> results.hair_density.term in {Extremely Low/Low/Medium/High Density}
 *
 * The photo should be the front view with the head lowered ~45 degrees so the
 * crown/scalp is visible (the capture UI guides this). Provider terms are mapped
 * to our stable enum so the UI never depends on raw provider values. 1 unit,
 * charged only on success.
 */

import type { HairDensityTerm } from "../../types";
import type { HairDensityAdapter, HairDensityOutcome, NormalizedPhoto } from "../types";
import { createTask, pollTask, uploadFile, YouCamError } from "./client";

const TASK_PATH = "/s2s/v2.0/task/hair-density-detection";

/** Documented provider term strings -> internal enum. */
export function mapHairDensityTerm(raw: string | null): HairDensityTerm {
  if (!raw) return "unknown";
  const value = raw.trim().toLowerCase();
  // Check the most specific phrase first so "extremely low" isn't read as "low".
  if (value.includes("extremely low")) return "extremely_low";
  if (value.includes("low")) return "low";
  if (value.includes("medium")) return "medium";
  if (value.includes("high")) return "high";
  return "unknown";
}

/** Read `results.hair_density.term` from a raw results object. */
function readDensityTerm(results: Record<string, unknown> | undefined): string | null {
  if (!results) return null;
  const density = results.hair_density;
  if (density && typeof density === "object") {
    const term = (density as Record<string, unknown>).term;
    if (typeof term === "string") return term;
  }
  if (typeof results.term === "string") return results.term;
  return null;
}

export class YouCamHairDensityAdapter implements HairDensityAdapter {
  readonly mode = "live" as const;

  async analyze(photo: NormalizedPhoto): Promise<HairDensityOutcome> {
    try {
      const fileId = await uploadFile(photo);
      const taskId = await createTask(TASK_PATH, { src_file_id: fileId });
      const result = await pollTask(TASK_PATH, taskId);

      if (result.taskStatus !== "success") {
        return {
          status: "failed",
          term: "unknown",
          rawResult: null,
          errorCode: result.errorCode || "density_failed"
        };
      }
      const term = readDensityTerm(result.results);
      return { status: "success", term: mapHairDensityTerm(term), rawResult: term, errorCode: null };
    } catch (err) {
      const code = err instanceof YouCamError ? err.errorCode || "provider_error" : "provider_error";
      return { status: "failed", term: "unknown", rawResult: null, errorCode: code };
    }
  }
}
