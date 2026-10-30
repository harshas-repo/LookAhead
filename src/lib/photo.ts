/**
 * Shared client-side photo pipeline (instruction §5, tech-implementation.md §2).
 *
 * ONE normalization path is used by BOTH the file-upload flow and the camera
 * capture flow, so a camera-captured photo goes through the exact same analysis
 * and visualization pipeline as an uploaded one. Output is always a JPEG with the
 * long side capped at 1024px — this satisfies the hairstyle VTO constraint
 * (jpg-only, <= 1024px) and keeps uploads small.
 *
 * Client-only: uses the DOM canvas APIs.
 */

export const MAX_SIDE = 1024;
const JPEG_QUALITY = 0.9;

/**
 * Exact output size for guided multi-angle capture. Hair Type Detection requires
 * the front/right/left trio to be the SAME size (it rejects a mismatch with
 * `error_mismatch_image_size`), so every angle is center-covered to this fixed
 * target rather than scaled to a variable aspect ratio.
 */
export const ANGLE_TARGET = { width: 768, height: 1024 } as const;

export interface NormalizedImage {
  blob: Blob;
  width: number;
  height: number;
}

function computeScale(w: number, h: number): number {
  const longest = Math.max(w, h);
  return longest > MAX_SIDE ? MAX_SIDE / longest : 1;
}

function canvasToJpeg(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Could not encode the image as JPEG."))),
      "image/jpeg",
      JPEG_QUALITY
    );
  });
}

/** Normalize any drawable source to a capped JPEG. */
export async function normalizeSource(
  source: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number
): Promise<NormalizedImage> {
  if (sourceWidth <= 0 || sourceHeight <= 0) {
    throw new Error("That image has no readable dimensions.");
  }
  const scale = computeScale(sourceWidth, sourceHeight);
  const width = Math.max(1, Math.round(sourceWidth * scale));
  const height = Math.max(1, Math.round(sourceHeight * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is not available in this browser.");
  // Fill white so any transparency flattens predictably for JPEG.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(source, 0, 0, width, height);

  const blob = await canvasToJpeg(canvas);
  return { blob, width, height };
}

/** Decode a File/Blob (from an <input type=file>) and normalize it. */
export async function normalizeFile(file: File | Blob): Promise<NormalizedImage> {
  const bitmap = await fileToBitmap(file);
  try {
    if ("width" in bitmap && "height" in bitmap && bitmap.width) {
      return await normalizeSource(bitmap as CanvasImageSource, bitmap.width, bitmap.height);
    }
  } finally {
    if (typeof (bitmap as ImageBitmap).close === "function") (bitmap as ImageBitmap).close();
  }
  throw new Error("Could not read that image.");
}

type BitmapLike = ImageBitmap | HTMLImageElement;

async function fileToBitmap(file: File | Blob): Promise<BitmapLike> {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file);
    } catch {
      // fall through to the <img> path
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    return img;
  } finally {
    // Revoke on the next tick so the element has time to decode.
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("That file doesn't appear to be a readable image."));
    img.src = url;
  });
}

/** Normalize the current frame of a <video> (camera capture). */
export async function normalizeVideoFrame(video: HTMLVideoElement): Promise<NormalizedImage> {
  const w = video.videoWidth;
  const h = video.videoHeight;
  if (!w || !h) throw new Error("The camera isn't producing a picture yet.");
  return normalizeSource(video, w, h);
}

/**
 * Normalize any drawable source to an EXACT fixed size by center-covering (scale
 * to fill, then center-crop). Multi-angle capture uses this so the three Hair
 * Type photos are always identical dimensions, satisfying the provider's
 * same-size rule regardless of the source aspect ratio.
 */
export async function normalizeToFixedTarget(
  source: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
  target: { width: number; height: number } = ANGLE_TARGET
): Promise<NormalizedImage> {
  if (sourceWidth <= 0 || sourceHeight <= 0) {
    throw new Error("That image has no readable dimensions.");
  }
  const width = target.width;
  const height = target.height;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is not available in this browser.");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  // Cover: scale so the source fills the target, then center it (cropping overflow).
  const scale = Math.max(width / sourceWidth, height / sourceHeight);
  const drawW = sourceWidth * scale;
  const drawH = sourceHeight * scale;
  ctx.drawImage(source, (width - drawW) / 2, (height - drawH) / 2, drawW, drawH);
  const blob = await canvasToJpeg(canvas);
  return { blob, width, height };
}

/** Decode a File/Blob and normalize it to the fixed angle target. */
export async function normalizeFileToTarget(
  file: File | Blob,
  target: { width: number; height: number } = ANGLE_TARGET
): Promise<NormalizedImage> {
  const bitmap = await fileToBitmap(file);
  try {
    if ("width" in bitmap && "height" in bitmap && bitmap.width) {
      return await normalizeToFixedTarget(bitmap as CanvasImageSource, bitmap.width, bitmap.height, target);
    }
  } finally {
    if (typeof (bitmap as ImageBitmap).close === "function") (bitmap as ImageBitmap).close();
  }
  throw new Error("Could not read that image.");
}

/** Normalize the current <video> frame to the fixed angle target. */
export async function normalizeVideoFrameToTarget(
  video: HTMLVideoElement,
  target: { width: number; height: number } = ANGLE_TARGET
): Promise<NormalizedImage> {
  const w = video.videoWidth;
  const h = video.videoHeight;
  if (!w || !h) throw new Error("The camera isn't producing a picture yet.");
  return normalizeToFixedTarget(video, w, h, target);
}

/**
 * Whether a secure context is available for camera access. getUserMedia requires
 * HTTPS (or localhost); we surface this so the UI can explain and fall back to
 * upload rather than failing silently (instruction §5).
 */
export function cameraSupported(): boolean {
  return (
    typeof navigator !== "undefined" &&
    Boolean(navigator.mediaDevices?.getUserMedia) &&
    (window.isSecureContext ?? true)
  );
}
