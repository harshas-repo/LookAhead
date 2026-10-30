"use client";

/**
 * PlanSheet — the composed, printable one-page plan (brief §7: Plan).
 *
 * It reports ONLY what the user actually chose (never invents content) and lays it
 * out as a calm personal document: what matters most, Plan A / Plan B, today's hair
 * record, anything still left open, and questions for the care team. Confirmed
 * choices carry a check mark; unresolved ones sit in a visually distinct "still
 * deciding" block, so status never rests on colour alone (brief §4, §8).
 *
 * Print-safe by design: the header is light paper rather than a dark ink band
 * (white text would be stripped by the print override), and the page marks the
 * interactive editors `.no-print` so this sheet is what lands on paper.
 */

import { useState } from "react";
import type { ReactNode } from "react";
import { api } from "@/lib/api-client";
import type { PlanSummary } from "@/lib/decision/engine";
import { useSession } from "@/lib/session-context";
import { PRIORITY_LABELS } from "@/lib/labels";
import { familyImageUrl, hairstyleImageUrl } from "@/lib/images";
import { CheckMark } from "@/components/art";
import { PreviewLightbox, type LightboxTarget } from "@/components/PreviewLightbox";
import { Badge } from "@/components/ui";

/**
 * A local illustration for a chosen option, derived from its id prefix when the
 * option carried no thumbnail. Mock hairstyle ids resolve to their per-style art;
 * the other families fall back to their representative image. Live ids without a
 * stored thumb resolve to null (the card then simply shows no picture).
 */
function illustrationForOption(optionId: string | null): string | null {
  if (!optionId) return null;
  if (optionId.startsWith("style_")) return hairstyleImageUrl(optionId.slice("style_".length));
  if (optionId.startsWith("ext_")) return familyImageUrl("extension");
  if (optionId.startsWith("bang_")) return familyImageUrl("bangs");
  if (optionId.startsWith("vol_")) return familyImageUrl("volume");
  return null;
}

/**
 * The chosen look as a small visual card, resolved in priority order: a preview
 * actually rendered on the user's photo (zoomable), then the representative
 * thumbnail the option carried, then a local illustration. Every one of these is
 * an illustration to help imagine a look — never a prediction.
 */
function PlanVisual({
  entry,
  onZoom
}: {
  entry: NonNullable<PlanSummary["planA"]>;
  onZoom: (target: LightboxTarget) => void;
}) {
  const { id, token } = useSession();
  const previewSrc =
    entry.preview && entry.preview.status === "success" && id && token
      ? api.previewUrl(id, token, entry.preview.id)
      : null;
  const src = previewSrc ?? entry.imageUrl ?? illustrationForOption(entry.optionId);
  if (!src) return null;
  const isPreview = Boolean(previewSrc);
  const alt = isPreview ? `Preview of ${entry.label}` : `Illustration of ${entry.label}`;
  const img = (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      className={
        "h-[5.5rem] w-[4.125rem] rounded-sm border border-hairline " +
        // A real render shows in full (never cropped); local art fills the frame.
        (isPreview ? "bg-paper object-contain" : "object-cover object-top")
      }
    />
  );
  if (!isPreview) return <span className="shrink-0">{img}</span>;
  return (
    <button
      type="button"
      onClick={() => onZoom({ src, label: alt })}
      className="shrink-0 cursor-zoom-in rounded-sm transition-opacity hover:opacity-85"
      aria-label={`Enlarge ${alt}`}
    >
      {img}
    </button>
  );
}

/** One label / value line of the document. */
function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1.5 border-b border-hairline/70 py-4 last:border-0 sm:grid-cols-[9rem_1fr] sm:gap-5 print-break">
      <dt className="label pt-1">{label}</dt>
      <dd className="text-[0.95rem] leading-relaxed text-body">{children}</dd>
    </div>
  );
}

/** A confirmed plan slot: a small visual card + check mark + label. */
function ChosenPlan({
  entry,
  onZoom
}: {
  entry: PlanSummary["planA"];
  onZoom: (target: LightboxTarget) => void;
}) {
  if (!entry) {
    return <span className="text-subtle">Not chosen yet — leaving this open is fine.</span>;
  }
  return (
    <span className="flex items-start gap-3.5">
      <PlanVisual entry={entry} onZoom={onZoom} />
      <span className="flex items-start gap-2">
        <CheckMark className="mt-0.5 h-4 w-4 shrink-0 text-periwinkle-deep" aria-hidden />
        <span>
          <span className="font-medium text-ink">{entry.label}</span>
          <span className="mt-0.5 block text-xs text-subtle">
            An illustration to help you imagine it — never a prediction.
          </span>
        </span>
      </span>
    </span>
  );
}

/**
 * Every preview the user actually rendered — the visual record of what they
 * explored, included in the plan document. Only real successes are shown;
 * thumbnails open the zoomable viewer.
 */
function ExploredPreviews({ onZoom }: { onZoom: (target: LightboxTarget) => void }) {
  const { id, token, session } = useSession();
  const successes = (session?.previews ?? []).filter((p) => p.status === "success");
  if (!id || !token || successes.length === 0) return null;
  return (
    <section className="mt-7 print-break">
      <h3 className="label">Previews you explored</h3>
      <p className="mt-1.5 text-xs text-subtle">
        Rendered on your photo to help you imagine a look — never a prediction of how you will look.
      </p>
      <div className="mt-3 grid grid-cols-3 gap-3 sm:grid-cols-4">
        {successes.map((p) => {
          const src = api.previewUrl(id, token, p.id);
          const label = `Preview of ${p.displayName}`;
          return (
            <figure key={p.id}>
              <button
                type="button"
                onClick={() => onZoom({ src, label })}
                className="w-full cursor-zoom-in rounded-sm transition-opacity hover:opacity-85"
                aria-label={`Enlarge ${label}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={src}
                  alt={label}
                  className="aspect-[4/5] w-full rounded-sm border border-hairline bg-paper object-contain"
                />
              </button>
              <figcaption className="mt-1 truncate text-xs text-subtle" title={p.displayName}>
                {p.displayName}
              </figcaption>
            </figure>
          );
        })}
      </div>
    </section>
  );
}

export function PlanSheet({ plan }: { plan: PlanSummary }) {
  const [lightbox, setLightbox] = useState<LightboxTarget | null>(null);
  const prepared = new Date(plan.createdAt).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric"
  });
  const hair = plan.hairRecord;

  // Parse the optional yyyy-mm-dd as a LOCAL date so it never shifts a day.
  let timing: string | null = null;
  if (plan.optionalTreatmentDate) {
    const [y, m, d] = plan.optionalTreatmentDate.split("-").map(Number);
    if (y && m && d) {
      timing = new Date(y, m - 1, d).toLocaleDateString(undefined, {
        month: "long",
        day: "numeric",
        year: "numeric"
      });
    }
  }

  return (
    <article className="card print-area overflow-hidden">
      {/* ── Document header (light, print-safe) ─────────────────────────── */}
      <header className="border-b border-hairline bg-paper/70 px-6 py-7 sm:px-9">
        <p className="label text-periwinkle-deep">LookAhead · Your appearance plan</p>
        <h2 className="mt-2 font-display text-display-sm text-ink">Your plan, in one place</h2>
        <p className="mt-1.5 text-sm text-subtle">Prepared {prepared}</p>
      </header>

      <div className="px-6 py-7 sm:px-9">
        {/* ── What matters most ─────────────────────────────────────────── */}
        <section className="print-break">
          <h3 className="label">What matters most</h3>
          {plan.priorities.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {plan.priorities.map((p) => {
                const top = plan.topPriorities.includes(p);
                return (
                  <Badge key={p} tone={top ? "sage" : "neutral"}>
                    {top && <CheckMark className="h-3.5 w-3.5" aria-hidden />}
                    {PRIORITY_LABELS[p]?.label ?? p}
                  </Badge>
                );
              })}
            </div>
          ) : (
            <p className="mt-2 text-sm text-subtle">No priorities recorded yet.</p>
          )}
          {plan.topPriorities.length > 0 && (
            <p className="mt-2.5 text-xs text-subtle">Checked marks are the one or two that matter most.</p>
          )}
        </section>

        <hr className="hairline-rule my-7" />

        {/* ── The plan itself ───────────────────────────────────────────── */}
        <dl className="print-break">
          <Row label="Plan A">
            <ChosenPlan entry={plan.planA} onZoom={setLightbox} />
          </Row>
          <Row label="Plan B">
            <ChosenPlan entry={plan.planB} onZoom={setLightbox} />
          </Row>
          <Row label="Hair today">
            {hair ? (
              <span>
                {hair.segments.map((s, i) =>
                  s.bold ? (
                    <strong key={i} className="font-semibold text-ink">
                      {s.text}
                    </strong>
                  ) : (
                    <span key={i}>{s.text}</span>
                  )
                )}
                {hair.source === "user" && hair.detected && hair.detected !== hair.userCorrected ? (
                  <span className="text-subtle"> (You adjusted the length from “{hair.detected}”.)</span>
                ) : null}
              </span>
            ) : (
              <span className="text-subtle">Not recorded.</span>
            )}
          </Row>
          {timing && (
            <Row label="Timing">
              <span>
                Around {timing}
                <span className="text-subtle"> · optional, and never a diagnosis.</span>
              </span>
            </Row>
          )}
        </dl>

        {/* ── The visual record: every preview actually rendered ────────── */}
        <ExploredPreviews onZoom={setLightbox} />

        {/* ── Still deciding — visually distinct, not an error ──────────── */}
        {plan.unresolved.length > 0 && (
          <section className="mt-7 rounded-card border border-dashed border-coral/45 bg-coral/[0.05] p-5 print-break">
            <h3 className="label text-[#a4482f]">Still deciding</h3>
            <p className="mt-1.5 text-sm text-body/80">
              Leaving these open is completely fine — they&apos;re kept here so nothing gets lost.
            </p>
            <ul className="mt-3 space-y-2">
              {plan.unresolved.map((decision) => (
                <li key={decision.id} className="flex items-start gap-2.5 text-sm text-body">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-coral/60" aria-hidden />
                  {decision.prompt}
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* ── Questions for the care team ───────────────────────────────── */}
        <section className="mt-7 print-break">
          <h3 className="label">Questions for my care team</h3>
          {plan.questionsForCareTeam.length > 0 ? (
            <ul className="mt-3 space-y-2">
              {plan.questionsForCareTeam.map((q) => (
                <li key={q} className="flex items-start gap-3 text-[0.95rem] text-body">
                  <span className="mt-2.5 h-px w-3 shrink-0 bg-periwinkle/50" aria-hidden />
                  {q}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-subtle">
              Nothing written yet. LookAhead doesn&apos;t answer medical questions — add anything you&apos;d like to ask a
              professional.
            </p>
          )}
        </section>

        {/* ── Honest footer (no development-oriented labels) ────────────── */}
        <footer className="mt-8 border-t border-hairline pt-5 text-xs leading-relaxed text-subtle print-break">
          <p>
            This is a personal planning aid, not medical advice, and it doesn&apos;t predict how treatment will affect you.
            Any hairstyle previews are illustrations or simulations to help you imagine a look — never photographs of a
            future result. Bring your questions to a qualified professional.
          </p>
        </footer>
      </div>

      {lightbox && <PreviewLightbox target={lightbox} onClose={() => setLightbox(null)} />}
    </article>
  );
}
