/**
 * Client-side API wrapper.
 *
 * Every call presents the session token via the `x-session-token` header (or, for
 * <img> sources, a ?token= query built by the url helpers). Errors are normalized
 * to `ApiClientError` with the server's stable `code` so the UI can react to
 * specific cases like `preview_limit_reached` or `error_hair_too_short`.
 */

import type { PublicPreview, PublicSession } from "@/lib/api/serialize";
import type { GuideResult } from "@/lib/guide";
import type { PlanSummary } from "@/lib/decision/engine";
import type { Recommendation } from "@/lib/decision/recommend";
import type { AppearanceOption, HairLength, Priority, Stage, TryOnFamily } from "@/lib/types";
import type { NormalizedImage } from "@/lib/photo";

/** Which slot of the multi-angle hair record an upload fills. */
export type PhotoAngle = "front" | "right" | "left" | "density";

export class ApiClientError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number
  ) {
    super(message);
    this.name = "ApiClientError";
  }
}

export interface ScenarioResponse {
  id: string;
  situation: string;
  question: string;
  decisionQuestionId: string;
  choices: string[];
}

export interface OptionsResponse {
  mode: "mock" | "live";
  options: AppearanceOption[];
  scenario: ScenarioResponse;
  recommendation: Recommendation;
  previewBudgetUsed: number;
  previewBudgetMax: number;
}

export interface TemplatesResponse {
  mode: "mock" | "live";
  templates: Array<{ templateId: string; displayName: string }>;
}

interface RequestOptions {
  method?: string;
  token?: string | null;
  body?: unknown;
  formData?: FormData;
}

/** Window event fired when a protected route reports the access pass is needed. */
export const ACCESS_REQUIRED_EVENT = "lookahead:access-required";

async function req<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (opts.token) headers["x-session-token"] = opts.token;
  // The Private Preview authorization travels as an HTTP-only cookie the browser
  // attaches automatically, so there is nothing to add here. The YouCam key lives on
  // the server only and is never sent to (or from) the client.
  let payload: BodyInit | undefined;
  if (opts.formData) {
    payload = opts.formData;
  } else if (opts.body !== undefined) {
    headers["content-type"] = "application/json";
    payload = JSON.stringify(opts.body);
  }

  const res = await fetch(path, { method: opts.method ?? "GET", headers, body: payload });
  const text = await res.text();
  const data = text ? (JSON.parse(text) as Record<string, unknown>) : {};

  if (!res.ok) {
    const err = (data.error ?? {}) as { code?: string; message?: string };
    const code = err.code ?? "request_failed";
    // A protected route reported the pass is missing/expired: ask the Header's Preview
    // Access dialog to open so the visitor can re-enter it (also covers a cookie that
    // lapsed mid-session). The server-side check remains the real enforcement.
    if (code === "access_required" && typeof window !== "undefined") {
      window.dispatchEvent(new Event(ACCESS_REQUIRED_EVENT));
    }
    throw new ApiClientError(err.message ?? res.statusText, code, res.status);
  }
  return data as T;
}

export const api = {
  /** Private Preview gate status (secret-free): is a pass needed, and do we hold one? */
  getAccess: () => req<{ required: boolean; authorized: boolean }>("/api/access"),

  /** Submit an access pass; on success the server sets an HTTP-only cookie. */
  submitAccess: (code: string) =>
    req<{ ok: boolean; authorized: boolean }>("/api/access", { method: "POST", body: { code } }),

  createSession: () => req<{ token: string; session: PublicSession }>("/api/sessions", { method: "POST" }),

  getSession: (id: string, token: string) =>
    req<{ session: PublicSession }>(`/api/sessions/${id}`, { token }),

  updateProfile: (
    id: string,
    token: string,
    patch: {
      priorities?: Priority[];
      topPriorities?: Priority[];
      optionalTreatmentDate?: string | null;
      consentGranted?: boolean;
      currentStage?: Stage;
    }
  ) => req<{ session: PublicSession }>(`/api/sessions/${id}`, { method: "PATCH", token, body: patch }),

  deleteSession: (id: string, token: string) =>
    req<{ deleted: boolean }>(`/api/sessions/${id}`, { method: "DELETE", token }),

  uploadPhoto: (id: string, token: string, image: NormalizedImage, angle: PhotoAngle = "front") => {
    const form = new FormData();
    form.append("photo", image.blob, "photo.jpg");
    form.append("width", String(image.width));
    form.append("height", String(image.height));
    form.append("angle", angle);
    return req<{ session: PublicSession }>(`/api/sessions/${id}/photos`, {
      method: "POST",
      token,
      formData: form
    });
  },

  runHairAnalysis: (id: string, token: string, photoRefId?: string) =>
    req<{ session: PublicSession }>(`/api/sessions/${id}/hair-analysis`, {
      method: "POST",
      token,
      body: photoRefId ? { photoRefId } : {}
    }),

  correctHairAnalysis: (id: string, token: string, action: "confirm" | "correct" | "skip", correctedLength?: HairLength) =>
    req<{ session: PublicSession }>(`/api/sessions/${id}/hair-analysis`, {
      method: "PATCH",
      token,
      body: { action, correctedLength }
    }),

  getOptions: (id: string, token: string) =>
    req<OptionsResponse>(`/api/sessions/${id}/options`, { token }),

  createPreview: (id: string, token: string, templateId: string, photoRefId: string) =>
    req<{ preview: PublicPreview; reused: boolean; previewBudgetUsed: number; previewBudgetMax: number }>(
      `/api/sessions/${id}/previews`,
      { method: "POST", token, body: { templateId, photoRefId } }
    ),

  pollPreview: (id: string, token: string, previewId: string) =>
    req<{ preview: PublicPreview }>(`/api/sessions/${id}/previews/${previewId}`, { token }),

  getGuide: (id: string, token: string, currentStage: Stage) =>
    req<{ guide: GuideResult; mode: "mock" | "live" }>(`/api/sessions/${id}/guide`, {
      method: "POST",
      token,
      body: { currentStage }
    }),

  recordDecision: (
    id: string,
    token: string,
    decision: { questionId: string; prompt: string; selectedOption?: string | null; isResolved: boolean; note?: string | null }
  ) => req<{ session: PublicSession }>(`/api/sessions/${id}/decisions`, { method: "POST", token, body: decision }),

  getPlan: (id: string, token: string) => req<{ plan: PlanSummary }>(`/api/sessions/${id}/plan`, { token }),

  updatePlan: (
    id: string,
    token: string,
    patch: {
      planA?: { label: string; optionId?: string | null; previewId?: string | null; imageUrl?: string | null; family?: TryOnFamily; rationale?: string | null } | null;
      planB?: { label: string; optionId?: string | null; previewId?: string | null; imageUrl?: string | null; family?: TryOnFamily; rationale?: string | null } | null;
      questionsForCareTeam?: string[];
    }
  ) => req<{ plan: PlanSummary; session: PublicSession }>(`/api/sessions/${id}/plan`, {
    method: "PATCH",
    token,
    body: patch
  }),

  /** Authenticated image URLs (token in query so <img> can load them). */
  photoUrl: (id: string, token: string, photoId: string) =>
    `/api/sessions/${id}/photos/${photoId}/image?token=${encodeURIComponent(token)}`,
  previewUrl: (id: string, token: string, previewId: string) =>
    `/api/sessions/${id}/previews/${previewId}/image?token=${encodeURIComponent(token)}`
};
