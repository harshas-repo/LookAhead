/**
 * LookAhead — core domain types.
 *
 * These types model the user journey described in scope.md / solution.md and the
 * data model in tech-implementation.md §7. They are intentionally explicit and
 * serializable so a session can be persisted as JSON and rehydrated safely.
 */

/** Workflow stages (finite-state machine — tech-implementation.md §5). */
export const STAGES = [
  "START",
  "PROFILE",
  "PHOTO_CAPTURE",
  "HAIR_ANALYSIS",
  "PREPARATION",
  "OPTION_EXPLORATION",
  "PLAN_A",
  "SCENARIO_REHEARSAL",
  "PLAN_B",
  "PLAN_REVIEW",
  "COMPLETE"
] as const;

export type Stage = (typeof STAGES)[number];

/** Priorities the user can select (solution.md — Understand Me). */
export const PRIORITIES = [
  "familiar_appearance",
  "comfort",
  "privacy",
  "cost",
  "control_timing"
] as const;

export type Priority = (typeof PRIORITIES)[number];

/**
 * Normalized hair-length categories returned by the analysis adapter.
 * Derived from the provider result strings (api-feasibility.md §2.1) and mapped
 * to a stable internal enum so the UI never depends on raw provider values.
 */
export const HAIR_LENGTHS = [
  "above_ear",
  "ear_length",
  "short",
  "medium",
  "long",
  "unknown"
] as const;

export type HairLength = (typeof HAIR_LENGTHS)[number];

/**
 * Normalized hair-density categories (AI Hair Density Detection). The provider
 * returns a `term` string ("Medium Density" etc.) which we map to this stable
 * enum so the UI never depends on raw provider values.
 */
export const DENSITY_TERMS = ["extremely_low", "low", "medium", "high", "unknown"] as const;

export type HairDensityTerm = (typeof DENSITY_TERMS)[number];

/**
 * Which try-on capability renders a preview. Each family maps to a distinct
 * provider endpoint (hairstyle -> hair-transfer, extension -> hair-ext, bangs ->
 * hair-bang, volume -> hair-vol) but shares the identical create + poll shape.
 */
export const TRY_ON_FAMILIES = ["hairstyle", "extension", "bangs", "volume"] as const;

export type TryOnFamily = (typeof TRY_ON_FAMILIES)[number];

/** Whether the provider is running in mock or live mode — surfaced to the UI. */
export type ProviderMode = "mock" | "live";

/** Photo consent + handling status (privacy by design — instruction §13). */
export interface PhotoConsent {
  /** User agreed to capture/upload and to send the photo to the provider. */
  granted: boolean;
  grantedAt: string | null;
}

export interface UserProfile {
  priorities: Priority[];
  /** The user's top one or two priorities, if they chose to highlight them. */
  topPriorities: Priority[];
  /** Optional; never a diagnosis. Stored as ISO date string (yyyy-mm-dd). */
  optionalTreatmentDate: string | null;
  consent: PhotoConsent;
}

/** A stored photo reference. We keep the file on disk, not bytes in the DB row. */
export interface PhotoRef {
  /** Opaque server-side id; maps to a stored file. */
  id: string;
  /** Normalized JPEG we send to the provider. */
  storedPath: string;
  width: number;
  height: number;
  createdAt: string;
}

export interface HairAnalysisResult {
  provider: "youcam-hair-length" | "mock-hair-length";
  /** Normalized category. */
  length: HairLength;
  /** The provider's raw result string, for transparency. */
  rawResult: string | null;
  /** User-confirmed or user-corrected value, if the user adjusted it. */
  userCorrection: HairLength | null;
  status: "pending" | "success" | "failed" | "skipped";
  errorCode: string | null;
  analyzedAt: string | null;
}

/** Hair Density Detection result (single, head-lowered photo). */
export interface HairDensityResult {
  provider: "youcam-hair-density" | "mock-hair-density";
  /** Normalized category. */
  term: HairDensityTerm;
  /** The provider's raw term string, for transparency. */
  rawResult: string | null;
  status: "pending" | "success" | "failed" | "skipped";
  errorCode: string | null;
  analyzedAt: string | null;
}

/** Hair Type Detection result (three-angle photo set: front, right, left). */
export interface HairTypeResult {
  provider: "youcam-hair-type" | "mock-hair-type";
  /** Provider `mapping`, e.g. "1 to 2a". */
  mapping: string | null;
  /** Provider `term`, e.g. "Straight to Slight Wavy" (already human-readable). */
  term: string | null;
  status: "pending" | "success" | "failed" | "skipped";
  errorCode: string | null;
  analyzedAt: string | null;
}

export interface HairRecord {
  /** Primary front photo — used for Hair Length and every try-on preview. */
  photoRef: PhotoRef | null;
  /** Extra guided angles: right + left feed Hair Type; density feeds Hair Density. */
  anglePhotos: {
    right: PhotoRef | null;
    left: PhotoRef | null;
    density: PhotoRef | null;
  };
  /** Hair Length Detection result. */
  analysis: HairAnalysisResult | null;
  /** Hair Density Detection result (optional enhancement). */
  density: HairDensityResult | null;
  /** Hair Type Detection result (optional enhancement). */
  type: HairTypeResult | null;
}

/** A single hairstyle preview (VTO) attempt/result. */
export interface Preview {
  id: string;
  /** Provider template id (verified from the template list) — never invented. */
  templateId: string;
  /** Human-readable display name for the plan. */
  displayName: string;
  /** Which try-on capability rendered this (drives the correct poll endpoint). */
  family: TryOnFamily;
  inputPhotoRefId: string;
  /** Provider task id, for status tracking without logging image content. */
  taskId: string | null;
  /** Result image reference (re-hosted path or provider URL). */
  outputImageRef: string | null;
  status: "processing" | "success" | "failed";
  errorCode: string | null;
  /** Whether this attempt counted against the session preview budget. */
  charged: boolean;
  createdAt: string;
}

/** A decision the user made (or explicitly left unresolved). */
export interface Decision {
  id: string;
  /** Stable question/scenario identifier from the library. */
  questionId: string;
  prompt: string;
  selectedOption: string | null;
  isResolved: boolean;
  /** Free-text the user wants to raise with a professional. */
  note: string | null;
  answeredAt: string;
}

/** An appearance option presented during rehearsal. */
export interface AppearanceOption {
  id: string;
  label: string;
  description: string;
  /** Whether a visual preview is supported for this option. */
  visualizable: boolean;
  /** Template id(s) that can render this option, when visualizable. */
  templateIds: string[];
  /** Provider's sample image for the style (live catalog thumbnail), when available. */
  sampleImageUrl?: string | null;
  /** Which try-on capability renders this option (present when visualizable). */
  family?: TryOnFamily;
  /** Category, used by the decision engine + plan grouping. */
  category: "hairstyle" | "covering" | "no_covering" | "other";
}

export interface Plan {
  planA: PlanEntry | null;
  planB: PlanEntry | null;
  questionsForCareTeam: string[];
  updatedAt: string | null;
}

export interface PlanEntry {
  /** Decision/option label chosen by the user. */
  label: string;
  optionId: string | null;
  /** Preview reference if the user attached one. */
  previewId: string | null;
  /** Representative image (provider thumb) so the plan shows a visual card even
   * when no preview was generated. Never a prediction — an illustration. */
  imageUrl?: string | null;
  /** Which try-on family the chosen option belongs to. */
  family?: TryOnFamily;
  rationale: string | null;
}

/** A curated hairstyle template returned by the provider template list. */
export interface HairstyleTemplate {
  templateId: string;
  displayName: string;
  category: AppearanceOption["category"];
  /** Curated flag — only a small subset is surfaced to the user. */
  curated: boolean;
}

/** The full session record — the unit of persistence. */
export interface Session {
  id: string;
  /** Unpredictable token used for ownership checks (not the same as id in URLs). */
  token: string;
  createdAt: string;
  expiresAt: string;
  currentStage: Stage;
  profile: UserProfile;
  hairRecord: HairRecord;
  previews: Preview[];
  decisions: Decision[];
  plan: Plan;
  /** Count of preview attempts that consumed budget (server-enforced). */
  previewBudgetUsed: number;
}

/** Normalized async task status exposed to the frontend (never raw provider shape). */
export type TaskState = "processing" | "success" | "failed";
