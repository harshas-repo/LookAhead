/**
 * Serialize a Session for the client.
 *
 * We deliberately strip anything sensitive or internal:
 *   - the ownership token (the client already holds it from creation),
 *   - on-disk photo paths (images are fetched through authenticated endpoints),
 *   - provider task ids.
 * The client gets a stable, secret-free view it can render from.
 */

import type { PhotoRef, Preview, Session } from "../types";

export interface PublicPhotoRef {
  id: string;
  width: number;
  height: number;
  createdAt: string;
}

export interface PublicPreview {
  id: string;
  templateId: string;
  displayName: string;
  /** Which try-on capability rendered this (hairstyle/extension/bangs/volume). */
  family: Preview["family"];
  status: Preview["status"];
  errorCode: string | null;
  createdAt: string;
  /** URL the client can load the rendered image from (authenticated by token). */
  imageUrl: string | null;
}

export interface PublicSession {
  id: string;
  currentStage: Session["currentStage"];
  createdAt: string;
  expiresAt: string;
  profile: Session["profile"];
  hairRecord: {
    photoRef: PublicPhotoRef | null;
    anglePhotos: {
      right: PublicPhotoRef | null;
      left: PublicPhotoRef | null;
      density: PublicPhotoRef | null;
    };
    analysis: Session["hairRecord"]["analysis"];
    density: Session["hairRecord"]["density"];
    type: Session["hairRecord"]["type"];
  };
  previews: PublicPreview[];
  decisions: Session["decisions"];
  plan: Session["plan"];
  previewBudgetUsed: number;
  previewBudgetMax: number;
  providerMode: "mock" | "live";
}

/** Public view of a stored photo ref: identity + dimensions only, never the path. */
function publicPhotoRef(ref: PhotoRef | null): PublicPhotoRef | null {
  if (!ref) return null;
  return { id: ref.id, width: ref.width, height: ref.height, createdAt: ref.createdAt };
}

export function publicSession(session: Session, providerMode: "mock" | "live", previewBudgetMax: number): PublicSession {
  return {
    id: session.id,
    currentStage: session.currentStage,
    createdAt: session.createdAt,
    expiresAt: session.expiresAt,
    profile: session.profile,
    hairRecord: {
      photoRef: publicPhotoRef(session.hairRecord.photoRef),
      anglePhotos: {
        right: publicPhotoRef(session.hairRecord.anglePhotos?.right ?? null),
        left: publicPhotoRef(session.hairRecord.anglePhotos?.left ?? null),
        density: publicPhotoRef(session.hairRecord.anglePhotos?.density ?? null)
      },
      analysis: session.hairRecord.analysis,
      density: session.hairRecord.density ?? null,
      type: session.hairRecord.type ?? null
    },
    previews: session.previews.map((p) => ({
      id: p.id,
      templateId: p.templateId,
      displayName: p.displayName,
      family: p.family ?? "hairstyle",
      status: p.status,
      errorCode: p.errorCode,
      createdAt: p.createdAt,
      imageUrl: p.status === "success" ? `/api/sessions/${session.id}/previews/${p.id}/image` : null
    })),
    decisions: session.decisions,
    plan: session.plan,
    previewBudgetUsed: session.previewBudgetUsed,
    previewBudgetMax,
    providerMode
  };
}

/** Public shape for a single preview (used by the preview routes). */
export function publicPreview(sessionId: string, p: Preview): PublicPreview {
  return {
    id: p.id,
    templateId: p.templateId,
    displayName: p.displayName,
    family: p.family ?? "hairstyle",
    status: p.status,
    errorCode: p.errorCode,
    createdAt: p.createdAt,
    imageUrl: p.status === "success" ? `/api/sessions/${sessionId}/previews/${p.id}/image` : null
  };
}
