"use client";

/**
 * PhotoCapture — guided multi-angle capture for the hair record.
 *
 * Four angles build the record: front (used for Hair Length and every preview),
 * right + left (feed Hair Type), and a lowered head (feeds Hair Density). The four
 * slots sit side by side in one compact, equal-width row; each shows a small visual
 * guide so the angle is easy to match. Both capture paths (upload + camera) save
 * straight to their slot through the same fixed-size normalization (768×1024
 * center-cover) so the Hair Type trio is always identical dimensions — there is no
 * per-photo confirmation step. Creating the hair record itself is one explicit
 * action in Step 3, so nothing is analysed (or charged) until the user asks.
 *
 * Camera access requires a secure context (HTTPS or localhost). When it isn't
 * available we explain why and fall back to upload rather than failing silently.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiClientError, type PhotoAngle } from "@/lib/api-client";
import { useSession } from "@/lib/session-context";
import { cameraSupported, normalizeFileToTarget, normalizeVideoFrameToTarget } from "@/lib/photo";
import { guideImageUrl } from "@/lib/images";
import { Badge, Button, Card, Notice } from "@/components/ui";

type Phase = "idle" | "camera";

interface Slot {
  angle: PhotoAngle;
  title: string;
  cue: string;
  required: boolean;
  purpose: string;
}

/** The four capture slots, in the order the record is built. */
const SLOTS: Slot[] = [
  {
    angle: "front",
    title: "Front",
    cue: "Face the camera in even light, hair visible, nothing covering your face.",
    required: true,
    purpose: "Used for length and every preview"
  },
  {
    angle: "right",
    title: "Turn right ~45°",
    cue: "Turn your head to your right, about halfway — keep your hair in frame.",
    required: false,
    purpose: "Helps detect hair type"
  },
  {
    angle: "left",
    title: "Turn left ~45°",
    cue: "Turn your head to your left, about halfway — keep your hair in frame.",
    required: false,
    purpose: "Helps detect hair type"
  },
  {
    angle: "density",
    title: "Lower head ~45°",
    cue: "Tilt your head down so the crown is visible to the camera.",
    required: false,
    purpose: "Helps detect hair density"
  }
];

const TITLE_FOR_ANGLE: Record<PhotoAngle, string> = {
  front: "Front",
  right: "Turn right ~45°",
  left: "Turn left ~45°",
  density: "Lower head ~45°"
};

export function PhotoCapture({ onUploaded }: { onUploaded?: () => void }) {
  const { id, token, session, setSession } = useSession();
  const [phase, setPhase] = useState<Phase>("idle");
  const [activeAngle, setActiveAngle] = useState<PhotoAngle>("front");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [consent, setConsent] = useState(session?.profile.consent.granted ?? false);

  const fileRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const cameraReady = cameraSupported();

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => () => stopCamera(), [stopCamera]);

  const anglePhotos = session?.hairRecord.anglePhotos ?? { right: null, left: null, density: null };

  function refForAngle(angle: PhotoAngle) {
    if (angle === "front") return session?.hairRecord.photoRef ?? null;
    return anglePhotos[angle] ?? null;
  }

  function thumbFor(angle: PhotoAngle): string | null {
    const ref = refForAngle(angle);
    return ref && id && token ? api.photoUrl(id, token, ref.id) : null;
  }

  async function grantConsent(): Promise<boolean> {
    if (!id || !token) return false;
    if (session?.profile.consent.granted) return true;
    const { session: updated } = await api.updateProfile(id, token, { consentGranted: true });
    setSession(updated);
    setConsent(true);
    return true;
  }

  function openUpload(angle: PhotoAngle) {
    setActiveAngle(angle);
    setError(null);
    if (fileRef.current) {
      fileRef.current.value = ""; // allow re-picking the same file for a retake
      fileRef.current.click();
    }
  }

  /** Normalize + save a picked file straight to its slot (no confirmation step). */
  async function uploadFile(file: File, angle: PhotoAngle) {
    if (!id || !token) return;
    setError(null);
    setBusy(true);
    try {
      const ok = await grantConsent();
      if (!ok) throw new ApiClientError("Please confirm you're happy to add a photo.", "consent_required", 403);
      const normalized = await normalizeFileToTarget(file);
      const { session: updated } = await api.uploadPhoto(id, token, normalized, angle);
      setSession(updated);
      onUploaded?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save that photo.");
    } finally {
      setBusy(false);
    }
  }

  async function startCamera(angle: PhotoAngle) {
    setActiveAngle(angle);
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 1280 } },
        audio: false
      });
      streamRef.current = stream;
      setPhase("camera");
      // Attach after the element renders.
      requestAnimationFrame(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          void videoRef.current.play();
        }
      });
    } catch {
      setError("We couldn't reach the camera. You can upload a photo instead — it works exactly the same.");
    }
  }

  /** Capture the live frame and save it straight to the active slot, then return. */
  async function captureFrame() {
    if (!videoRef.current || !id || !token) return;
    setError(null);
    setBusy(true);
    try {
      const ok = await grantConsent();
      if (!ok) throw new ApiClientError("Please confirm you're happy to add a photo.", "consent_required", 403);
      const normalized = await normalizeVideoFrameToTarget(videoRef.current);
      const { session: updated } = await api.uploadPhoto(id, token, normalized, activeAngle);
      setSession(updated);
      onUploaded?.();
      stopCamera();
      setPhase("idle");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not capture that photo.");
    } finally {
      setBusy(false);
    }
  }

  function cancelCamera() {
    stopCamera();
    setPhase("idle");
  }

  const frontDone = Boolean(refForAngle("front"));
  const addedCount = SLOTS.filter((s) => refForAngle(s.angle)).length;

  return (
    <Card className="space-y-5">
      {!session?.profile.consent.granted && (
        <label className="flex cursor-pointer items-start gap-3 rounded-card border border-line bg-cream/60 p-4">
          <input
            type="checkbox"
            className="mt-1 h-4 w-4 accent-[#4B47C9]"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
          />
          <span className="text-sm leading-relaxed text-charcoal/85">
            I&apos;m happy to add photos of how I look today. They&apos;re stored privately for this session, used only
            to describe my hair and render previews, and I can delete everything at any time.
          </span>
        </label>
      )}

      {phase === "idle" && (
        <div className="space-y-4">
          <div className="space-y-1.5">
            <p className="text-sm leading-relaxed text-subtle">
              Add the four angles below — front first, then right, left, and a lowered head. Each photo saves straight
              to its slot; you&apos;ll create the hair record in Step 3 when you&apos;re ready.
            </p>
            <p className="muted text-xs">
              {frontDone ? `${addedCount} of 4 photos added.` : "No photos added yet."} Everything stays private to this
              session.
            </p>
          </div>

          {/* One compact row of equal-width slots (2×2 on the smallest screens). */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {SLOTS.map((slot) => {
              const thumb = thumbFor(slot.angle);
              const guide = guideImageUrl(slot.angle);
              const slotBusy = busy && activeAngle === slot.angle;
              return (
                <div
                  key={slot.angle}
                  className="flex flex-col overflow-hidden rounded-card border border-hairline bg-surface"
                >
                  <div className="relative aspect-[3/4] w-full overflow-hidden bg-cream/50">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={thumb ?? guide ?? undefined}
                      alt={thumb ? `Your ${slot.title} photo` : `Guide for ${slot.title}`}
                      className="h-full w-full object-cover"
                      onError={(e) => {
                        e.currentTarget.style.visibility = "hidden";
                      }}
                    />
                    {(slot.required || thumb) && (
                      <span className="absolute left-1.5 top-1.5">
                        {slot.required ? (
                          <Badge tone="lavender">Required</Badge>
                        ) : (
                          <Badge tone="sage">Added ✓</Badge>
                        )}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-1 flex-col gap-1 p-2.5">
                    <p className="text-xs font-medium leading-tight text-ink" title={slot.cue}>
                      {slot.title}
                    </p>
                    <p className="muted text-[0.68rem] leading-snug">{slot.purpose}</p>
                    <div className="mt-auto grid grid-cols-2 gap-1.5 pt-1.5">
                      <Button
                        size="sm"
                        variant={thumb ? "ghost" : "primary"}
                        onClick={() => openUpload(slot.angle)}
                        disabled={!consent || busy}
                        loading={slotBusy}
                      >
                        {thumb ? "Replace" : "Upload"}
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => void startCamera(slot.angle)}
                        disabled={!consent || busy || !cameraReady}
                      >
                        {thumb ? "Retake" : "Take"}
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void uploadFile(file, activeAngle);
              e.target.value = "";
            }}
          />

          {!cameraReady && (
            <Notice tone="info">
              Camera capture needs a secure connection (HTTPS or localhost). Uploading a photo works exactly the same
              and uses the identical pipeline.
            </Notice>
          )}
          {!consent && <p className="muted text-sm">Please confirm the note above to enable photo options.</p>}
        </div>
      )}

      {phase === "camera" && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="lavender">{TITLE_FOR_ANGLE[activeAngle]}</Badge>
            <p className="muted text-sm">Match the guide, then capture — it saves straight to this slot.</p>
          </div>
          <div className="overflow-hidden rounded-card border border-line bg-charcoal/5">
            <video ref={videoRef} playsInline muted className="mx-auto max-h-[60vh] w-full object-contain" />
          </div>
          <div className="flex flex-wrap gap-3">
            <Button onClick={captureFrame} disabled={busy} loading={busy}>
              Capture
            </Button>
            <Button variant="ghost" onClick={cancelCamera} disabled={busy}>
              Cancel
            </Button>
          </div>
          <p className="muted text-sm">
            Tip: keep your hair in frame and hold the angle steady for a second before capturing.
          </p>
        </div>
      )}

      {error && <Notice tone="warn">{error}</Notice>}
    </Card>
  );
}
