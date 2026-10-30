/**
 * LookAhead illustration manifest.
 *
 * The app's artwork is a small, consistent series of AI-assisted editorial
 * illustrations (soft painterly head-and-shoulders portraits on warm paper) that
 * live in `public/images`. This module is the single source of truth that maps
 * domain ids to those files, so the client tiles and the mock preview provider
 * always agree on which picture represents which option.
 *
 * Pure data + tiny helpers — safe to import from both client and server code.
 * The illustrations are clearly representational: the UI always pairs them with
 * honest copy ("illustration", "never a prediction") and they are never presented
 * as photographs of a real or future result.
 */

import type { TryOnFamily } from "./types";

/** Hairstyle templates that have a representative illustration (mock catalog). */
export const HAIRSTYLE_FILES: Record<string, string> = {
  "mock-soft-bob": "soft-bob.png",
  "mock-pixie": "pixie.png",
  "mock-shoulder": "shoulder.png",
  "mock-waves": "waves.png"
};

/**
 * Mock-mode illustrations for the non-hairstyle try-on families. Each family uses
 * one representative editorial image (mock previews are clearly simulated; live
 * mode uses the provider's own per-template thumbnails instead).
 */
export const FAMILY_FILES: Record<Exclude<TryOnFamily, "hairstyle">, string> = {
  extension: "extension.png",
  bangs: "bangs.png",
  volume: "volume.png"
};

/**
 * Guided-capture illustrations — one per angle the multi-photo hair record asks
 * for, so the upload UI can show a visual clue rather than only words.
 */
export const GUIDE_FILES: Record<string, string> = {
  front: "guide-front.png",
  right: "guide-right.png",
  left: "guide-left.png",
  density: "guide-density.png"
};

/** Public URL of the representative illustration for a hairstyle template. */
export function hairstyleImageUrl(templateId: string): string | null {
  const file = HAIRSTYLE_FILES[templateId];
  return file ? `/images/hairstyles/${file}` : null;
}

/** Filesystem path (relative to the project root) of a hairstyle illustration. */
export function hairstyleFileFor(templateId: string): string | null {
  return HAIRSTYLE_FILES[templateId] ?? null;
}

/** Public URL of the representative illustration for a try-on family (mock mode). */
export function familyImageUrl(family: TryOnFamily): string | null {
  if (family === "hairstyle") return null; // hairstyles use per-template art
  return `/images/families/${FAMILY_FILES[family]}`;
}

/** Public URL of the guided-capture illustration for a capture angle. */
export function guideImageUrl(angle: string): string | null {
  const file = GUIDE_FILES[angle];
  return file ? `/images/guides/${file}` : null;
}

/**
 * Path (relative to `public/images`) of the illustration the mock provider should
 * "render" for a template. Hairstyles use their per-style art; the other families
 * fall back to their single representative image. Returns null when a template has
 * no illustration (e.g. the `mock-buzz` error demo), so the mock can fail cleanly.
 */
export function mockIllustrationFor(templateId: string): string | null {
  const hairstyle = HAIRSTYLE_FILES[templateId];
  if (hairstyle) return `hairstyles/${hairstyle}`;
  if (templateId.startsWith("mock-ext-")) return `families/${FAMILY_FILES.extension}`;
  if (templateId.startsWith("mock-bang-")) return `families/${FAMILY_FILES.bangs}`;
  if (templateId.startsWith("mock-vol-")) return `families/${FAMILY_FILES.volume}`;
  return null;
}
