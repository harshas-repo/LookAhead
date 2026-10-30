/**
 * Provider adapter contracts (api-feasibility.md §6).
 *
 * The rest of the application depends ONLY on these normalized interfaces, never
 * on YouCam's raw response shapes. That keeps the analysis endpoint swappable
 * (Hair Length vs Hair Type) and lets us run a fully-labelled mock mode with no
 * credits consumed.
 */

import type { HairDensityTerm, HairLength, ProviderMode, TaskState, TryOnFamily } from "../types";

/** A normalized JPEG held server-side, ready to send to a provider. */
export interface NormalizedPhoto {
  bytes: Buffer;
  contentType: "image/jpeg";
  fileName: string;
}

export interface HairAnalysisOutcome {
  status: Exclude<TaskState, "processing">;
  length: HairLength;
  /** Provider's own result string, kept for transparency in the UI. */
  rawResult: string | null;
  errorCode: string | null;
}

export interface HairAnalysisAdapter {
  readonly mode: ProviderMode;
  analyze(photo: NormalizedPhoto): Promise<HairAnalysisOutcome>;
}

/** Hair Density Detection outcome (single, head-lowered photo). */
export interface HairDensityOutcome {
  status: Exclude<TaskState, "processing">;
  /** Normalized density category. */
  term: HairDensityTerm;
  /** Provider's own term string, kept for transparency in the UI. */
  rawResult: string | null;
  errorCode: string | null;
}

export interface HairDensityAdapter {
  readonly mode: ProviderMode;
  analyze(photo: NormalizedPhoto): Promise<HairDensityOutcome>;
}

/** Hair Type Detection outcome (three-angle set: front, right, left). */
export interface HairTypeOutcome {
  status: Exclude<TaskState, "processing">;
  /** Provider `mapping`, e.g. "1 to 2a". */
  mapping: string | null;
  /** Provider `term`, e.g. "Straight to Slight Wavy" (already human-readable). */
  term: string | null;
  errorCode: string | null;
}

/** The three angles Hair Type Detection requires, all normalized to the SAME size. */
export interface HairTypePhotos {
  front: NormalizedPhoto;
  right: NormalizedPhoto;
  left: NormalizedPhoto;
}

export interface HairTypeAdapter {
  readonly mode: ProviderMode;
  analyze(photos: HairTypePhotos): Promise<HairTypeOutcome>;
}

export interface VtoTemplate {
  templateId: string;
  displayName: string;
  /** Which try-on capability renders this template (drives the endpoint + poll). */
  family: TryOnFamily;
  /** Provider sample image for the style (live catalog `thumb`), when available. */
  imageUrl?: string | null;
  /**
   * Provider gender category (live catalog `category_name`, e.g. "Female"/"Male").
   * Used to surface only female-presenting looks; undefined for mock templates.
   */
  category?: string | null;
}

export interface PreviewCreation {
  taskId: string;
}

export interface PreviewOutcome {
  status: TaskState;
  /** Provider temporary URL (live mode). May expire quickly. */
  resultUrl: string | null;
  /** Directly-produced bytes (mock mode) — avoids a network round-trip. */
  resultBytes: Buffer | null;
  errorCode: string | null;
}

export interface HairstyleVtoAdapter {
  readonly mode: ProviderMode;
  /** Verified template catalog. IDs are never invented. */
  listTemplates(): Promise<VtoTemplate[]>;
  createPreview(photo: NormalizedPhoto, templateId: string): Promise<PreviewCreation>;
  getPreview(taskId: string): Promise<PreviewOutcome>;
}
