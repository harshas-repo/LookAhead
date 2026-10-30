"use client";

/**
 * HairRecordCard — the "Hair Record" step.
 *
 * Runs Hair Length, and — when the extra angles are present — Hair Density and
 * Hair Type, then describes the hair in the photos TODAY as one warm sentence with
 * the detected values in bold (never a prediction). The user confirms or corrects
 * the length; their correction always wins and is what the final plan reports.
 * Each detection degrades independently: a failure (including the common
 * short-hair case) is a supported outcome, not a dead end, and missing angles are
 * gently offered as an optional way to enrich the record.
 */

import { useEffect, useState } from "react";
import { api } from "@/lib/api-client";
import { useSession } from "@/lib/session-context";
import { describeError, HAIR_LENGTH_LABELS, hairRecordSegments } from "@/lib/labels";
import { HAIR_LENGTHS, type HairLength } from "@/lib/types";
import { Button, Card, Notice, SectionHeading, cx } from "@/components/ui";

/**
 * Honest, time-based reassurance while hair analysis runs. The provider doesn't
 * report progress, so rather than fake a percentage we advance a calm status line
 * by elapsed time — the bar stays indeterminate. Pure so it can be reasoned about.
 */
function analysisStatusText(seconds: number): string {
  if (seconds < 5) return "Reading your hair length…";
  if (seconds < 12) return "Checking density and type…";
  if (seconds < 21) return "Almost there…";
  if (seconds < 36) return "Just finishing up…";
  return "Taking a little longer than usual — still working…";
}

export function HairRecordCard() {
  const { id, token, session, setSession } = useSession();
  const [busy, setBusy] = useState(false);
  /** True only while a hair-analysis run is in flight, to scope the loader. */
  const [analysing, setAnalysing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [correcting, setCorrecting] = useState(false);
  /** Seconds elapsed in the current analysis run — drives the rotating status line. */
  const [elapsed, setElapsed] = useState(0);

  const photoRef = session?.hairRecord.photoRef ?? null;
  const anglePhotos = session?.hairRecord.anglePhotos ?? { right: null, left: null, density: null };
  const analysis = session?.hairRecord.analysis ?? null;
  const density = session?.hairRecord.density ?? null;
  const type = session?.hairRecord.type ?? null;

  // While analysing, tick a 1s timer so the status line can advance with honest,
  // time-based reassurance. Resets to 0 the moment the run ends. Purely cosmetic —
  // the bar stays indeterminate because we never invent a real percentage.
  useEffect(() => {
    if (!analysing) {
      setElapsed(0);
      return;
    }
    const startedAt = Date.now();
    const timer = setInterval(() => setElapsed(Math.round((Date.now() - startedAt) / 1000)), 1000);
    return () => clearInterval(timer);
  }, [analysing]);

  async function run() {
    if (!id || !token || !photoRef) return;
    setBusy(true);
    setAnalysing(true);
    setError(null);
    try {
      const { session: updated } = await api.runHairAnalysis(id, token, photoRef.id);
      setSession(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The hair record didn't go through.");
    } finally {
      setBusy(false);
      setAnalysing(false);
    }
  }

  async function resolve(action: "confirm" | "correct" | "skip", correctedLength?: HairLength) {
    if (!id || !token) return;
    setBusy(true);
    setError(null);
    try {
      const { session: updated } = await api.correctHairAnalysis(id, token, action, correctedLength);
      setSession(updated);
      setCorrecting(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save that.");
    } finally {
      setBusy(false);
    }
  }

  const segments = hairRecordSegments({ length: analysis, density, type });
  const anySuccess = analysis?.status === "success" || density?.status === "success" || type?.status === "success";
  const recordedLength = analysis?.userCorrection ?? (analysis?.status === "success" ? analysis.length : null);
  const isRecorded = Boolean(recordedLength) || analysis?.status === "skipped";

  // Which detections still have inputs available but no success yet? The run button
  // (re)runs only those, so adding an angle later can enrich the record on demand.
  const canRunLength = Boolean(photoRef) && analysis?.status !== "success";
  const canRunDensity = Boolean(anglePhotos.density) && density?.status !== "success";
  const canRunType = Boolean(photoRef && anglePhotos.right && anglePhotos.left) && type?.status !== "success";
  const needsRun = canRunLength || canRunDensity || canRunType;

  const missingType = !(anglePhotos.right && anglePhotos.left);
  const missingDensity = !anglePhotos.density;

  return (
    <Card className="space-y-5">
      <SectionHeading
        eyebrow="Step 3"
        title="Your hair record"
        description="A short description of your hair as it is in the photos today — length, density, and type. This never predicts future change."
      />

      {!photoRef && (
        <Notice tone="info">Add your photos in Step 2 to create a hair record.</Notice>
      )}

      {analysing && (
        <div className="space-y-2.5" role="status" aria-live="polite">
          <div className="flex items-center gap-2.5">
            <span className="h-2 w-2 animate-pulse rounded-full bg-periwinkle" aria-hidden />
            <span className="animate-pulse text-sm font-medium text-ink">{analysisStatusText(elapsed)}</span>
          </div>
          <div className="bar-indeterminate" aria-hidden />
          <p className="muted text-xs">
            Reading length, density, and type from your photos. This runs here in the card — you can keep looking around
            while it works.
          </p>
        </div>
      )}

      {anySuccess && (
        <div className="rounded-card border border-line bg-cream/50 p-4">
          <p className="text-[1.05rem] leading-relaxed text-charcoal">
            {segments.map((s, i) =>
              s.bold ? (
                <strong key={i} className="font-semibold text-ink">
                  {s.text}
                </strong>
              ) : (
                <span key={i}>{s.text}</span>
              )
            )}
          </p>
        </div>
      )}

      {analysis?.status === "success" && !correcting && (
        <div className="space-y-3">
          {isRecorded ? (
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-sm text-sage-deep">Hair record saved ✓</span>
              <Button variant="ghost" size="sm" onClick={() => setCorrecting(true)} disabled={busy}>
                Change length
              </Button>
            </div>
          ) : (
            <div className="flex flex-wrap gap-3">
              <Button onClick={() => resolve("confirm")} disabled={busy}>
                Yes, that matches
              </Button>
              <Button variant="secondary" onClick={() => setCorrecting(true)} disabled={busy}>
                Let me correct it
              </Button>
              <Button variant="ghost" onClick={() => resolve("skip")} disabled={busy}>
                Skip
              </Button>
            </div>
          )}
        </div>
      )}

      {photoRef && (needsRun || analysis === null) && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-3">
            {needsRun && (
              <Button size="lg" onClick={run} loading={busy}>
                {anySuccess ? "Update my hair record" : "Create my hair record"}
              </Button>
            )}
            {analysis === null && (
              <Button variant="ghost" onClick={() => resolve("skip")} disabled={busy}>
                Skip for now
              </Button>
            )}
          </div>
          {needsRun && (
            <p className="muted text-xs">
              One tap runs everything on the photos you added in Step 2 — length, plus density and type when those
              angles are present. Nothing is analysed until you press it.
            </p>
          )}
        </div>
      )}

      {photoRef && (missingType || missingDensity) && (
        <div className="rounded-card border border-dashed border-hairline bg-paper/60 p-4">
          <p className="text-sm font-medium text-ink">Complete your record</p>
          <ul className="mt-1.5 list-disc space-y-1 pl-5 text-sm leading-relaxed text-subtle">
            {missingType && <li>Add right and left ~45° angles in Step 2 to describe your hair type.</li>}
            {missingDensity && <li>Add a lowered-head photo in Step 2 to describe hair density.</li>}
          </ul>
          <p className="muted mt-2 text-xs">
            Your record already describes everything you have added so far; add the remaining angles to complete it.
          </p>
        </div>
      )}

      {analysis?.status === "failed" && (
        <div className="space-y-4">
          <Notice tone="warn" title={describeError(analysis.errorCode).title}>
            {describeError(analysis.errorCode).body}
          </Notice>
          <div className="flex flex-wrap gap-3">
            <Button variant="secondary" onClick={run} loading={busy}>
              Try again
            </Button>
            <Button variant="ghost" onClick={() => setCorrecting(true)} disabled={busy}>
              Enter it myself
            </Button>
            <Button variant="ghost" onClick={() => resolve("skip")} disabled={busy}>
              Skip
            </Button>
          </div>
        </div>
      )}

      {density?.status === "failed" && (
        <Notice tone="warn" title={`Hair density: ${describeError(density.errorCode).title}`}>
          {describeError(density.errorCode).body} Your record still works without it.
        </Notice>
      )}

      {type?.status === "failed" && (
        <Notice tone="warn" title={`Hair type: ${describeError(type.errorCode).title}`}>
          {describeError(type.errorCode).body} Your record still works without it.
        </Notice>
      )}

      {analysis?.status === "skipped" && !correcting && (
        <div className="flex flex-wrap items-center gap-3">
          <span className="muted text-sm">Hair record skipped.</span>
          <Button variant="ghost" size="sm" onClick={() => setCorrecting(true)} disabled={busy}>
            Add it now
          </Button>
        </div>
      )}

      {correcting && (
        <div className="space-y-3">
          <p className="label">Which length is closest to your hair today?</p>
          <div className="flex flex-wrap gap-2">
            {HAIR_LENGTHS.filter((l) => l !== "unknown").map((l) => (
              <button
                key={l}
                type="button"
                onClick={() => resolve("correct", l)}
                disabled={busy}
                className={cx(
                  "rounded-pill border px-4 py-2 text-sm transition-colors",
                  recordedLength === l
                    ? "border-teal bg-teal-soft/40 text-teal-deep"
                    : "border-line bg-surface text-charcoal hover:border-teal/60"
                )}
              >
                {HAIR_LENGTH_LABELS[l]}
              </button>
            ))}
          </div>
        </div>
      )}

      {error && <Notice tone="warn">{error}</Notice>}
    </Card>
  );
}
