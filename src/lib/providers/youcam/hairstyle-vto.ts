/**
 * Live YouCam Virtual Try-On adapters, parameterized by family.
 *
 * All four families share one contract; only the endpoint slug differs:
 *   hairstyle -> hair-transfer (v2.1) / hair-style (v2.0)
 *   extension -> hair-ext (v2.0)   [positioned in the UI as a wig]
 *   bangs     -> hair-bang (v2.0)
 *   volume    -> hair-vol (v2.0)
 *   GET  /s2s/{ver}/task/template/{slug}   -> list templates
 *   POST /s2s/{ver}/task/{slug}            -> create task (src_file_id + template_id)
 *   GET  /s2s/{ver}/task/{slug}/{task_id}  -> poll -> results.url
 *
 * IMPORTANT limitation: hairstyle restyles EXISTING hair and may fail with
 * `error_hair_too_short`. Template IDs are always taken from the provider list —
 * never invented.
 */

import { getConfig } from "../../config";
import type { TryOnFamily } from "../../types";
import type { HairstyleVtoAdapter, NormalizedPhoto, PreviewCreation, PreviewOutcome, VtoTemplate } from "../types";
import { createTask, getJson, getTask, uploadFile, YouCamError } from "./client";

/**
 * Endpoint paths per try-on family. Hairstyle keeps its version-driven slug
 * (hair-transfer on v2.1, hair-style on v2.0); extension/bangs/volume are all
 * v2.0 with fixed slugs and share the identical create + poll contract.
 */
function pathsFor(family: TryOnFamily) {
  if (family === "hairstyle") {
    const v = getConfig().youcam.hairstyleVersion;
    const slug = v === "v2.0" ? "hair-style" : "hair-transfer";
    return { template: `/s2s/${v}/task/template/${slug}`, task: `/s2s/${v}/task/${slug}` };
  }
  const slug = family === "extension" ? "hair-ext" : family === "bangs" ? "hair-bang" : "hair-vol";
  return { template: `/s2s/v2.0/task/template/${slug}`, task: `/s2s/v2.0/task/${slug}` };
}

/** Best-effort extraction of a display name from an unknown template shape. */
function readName(t: Record<string, unknown>, id: string): string {
  for (const key of ["name", "title", "display_name", "label", "style_name"]) {
    const value = t[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return `Style ${id.slice(0, 6)}`;
}

function readId(t: Record<string, unknown>): string | null {
  for (const key of ["template_id", "id", "style_id"]) {
    const value = t[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number") return String(value);
  }
  return null;
}

/** Provider sample image for the style (the live catalog returns `thumb`). */
function readImage(t: Record<string, unknown>): string | null {
  for (const key of ["thumb", "image", "image_url", "thumbnail", "thumbnail_url"]) {
    const value = t[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

/** Provider gender category (the live catalog returns `category_name`, e.g. "Female"). */
function readCategory(t: Record<string, unknown>): string | null {
  for (const key of ["category_name", "category", "gender", "sex"]) {
    const value = t[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

/**
 * Family-parameterized live try-on adapter. The create body, the poll shape, and
 * the definitive-vs-transient error handling are identical across families, so a
 * single class serves all four — only the endpoint paths and the family tag differ.
 */
export class YouCamTryOnAdapter implements HairstyleVtoAdapter {
  readonly mode = "live" as const;

  constructor(readonly family: TryOnFamily) {}

  async listTemplates(): Promise<VtoTemplate[]> {
    const { template } = pathsFor(this.family);
    // page_size is capped by the provider (100 returns InvalidParameters); 20 is the
    // documented, accepted size and is plenty — the UI surfaces only a few styles.
    const json = (await getJson(`${template}?page_size=20`)) as Record<string, unknown>;
    const data = (json.data ?? json) as Record<string, unknown>;
    const list = (data.templates ?? data.items ?? data.results ?? data.list) as unknown;
    const arr = Array.isArray(list) ? list : [];
    const templates: VtoTemplate[] = [];
    for (const item of arr) {
      if (!item || typeof item !== "object") continue;
      const record = item as Record<string, unknown>;
      const id = readId(record);
      if (!id) continue;
      templates.push({
        templateId: id,
        displayName: readName(record, id),
        family: this.family,
        imageUrl: readImage(record),
        category: readCategory(record)
      });
    }
    return templates;
  }

  async createPreview(photo: NormalizedPhoto, templateId: string): Promise<PreviewCreation> {
    const { task } = pathsFor(this.family);
    const fileId = await uploadFile(photo);
    const taskId = await createTask(task, { src_file_id: fileId, template_id: templateId });
    return { taskId };
  }

  async getPreview(taskId: string): Promise<PreviewOutcome> {
    const { task } = pathsFor(this.family);
    try {
      // ONE non-blocking status check per call. The caller (the poll route, driven
      // by the client) re-checks on a short cadence, so a result is surfaced the
      // moment the provider finishes instead of holding a request open for minutes.
      const result = await getTask(task, taskId);
      if (result.taskStatus === "success") {
        if (result.resultUrl) {
          return { status: "success", resultUrl: result.resultUrl, resultBytes: null, errorCode: null };
        }
        return { status: "failed", resultUrl: null, resultBytes: null, errorCode: "empty_result" };
      }
      if (result.taskStatus === "error") {
        return { status: "failed", resultUrl: null, resultBytes: null, errorCode: result.errorCode || "preview_failed" };
      }
      return { status: "processing", resultUrl: null, resultBytes: null, errorCode: null };
    } catch (err) {
      // A definitive rejection means the task will never succeed; a transient
      // network/5xx blip should NOT kill the preview — report still-processing so
      // the next poll retries.
      const code = err instanceof YouCamError ? err.errorCode || "provider_error" : "provider_error";
      const definitive =
        err instanceof YouCamError && (err.status === 400 || err.status === 401 || err.status === 403 || err.status === 404);
      if (definitive) {
        return { status: "failed", resultUrl: null, resultBytes: null, errorCode: code };
      }
      return { status: "processing", resultUrl: null, resultBytes: null, errorCode: null };
    }
  }
}

/** Back-compat alias: the hairstyle-family adapter existing callers/tests import. */
export class YouCamHairstyleVtoAdapter extends YouCamTryOnAdapter {
  constructor() {
    super("hairstyle");
  }
}
