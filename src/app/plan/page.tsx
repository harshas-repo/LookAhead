"use client";

/**
 * Plan (`/plan`) — Plan A, scenario rehearsal, Plan B, care-team questions, and
 * the printable one-page summary.
 *
 * Nothing here is forced: Plan B and scenario answers can stay undecided, and the
 * sheet reports exactly what the user chose. The plan lives in the app (saved via
 * the API) and the summary can be downloaded as a PDF — summary only, with the
 * previews the user actually explored embedded as images.
 */

import { useCallback, useEffect, useState } from "react";
import { api, type OptionsResponse } from "@/lib/api-client";
import { cacheGet, cacheSet } from "@/lib/client-cache";
import type { PlanSummary } from "@/lib/decision/engine";
import { useSession } from "@/lib/session-context";
import type { AppearanceOption } from "@/lib/types";
import { hairstyleImageUrl } from "@/lib/images";
import { Header } from "@/components/Header";
import { SessionGate } from "@/components/SessionGate";
import { ScenarioRehearsal } from "@/components/ScenarioRehearsal";
import { CareTeamQuestions } from "@/components/CareTeamQuestions";
import { PlanSheet } from "@/components/PlanSheet";
import { PlanSlotPreview } from "@/components/PlanSlotPreview";
import { CheckMark } from "@/components/art";
import { Button, Card, SectionHeading, cx } from "@/components/ui";

/**
 * The reference image for an option, matching the rehearsal card: the provider's
 * own sample thumbnail for that (female-presenting) look in live mode, falling back
 * to a local editorial illustration only for mock ids that carry no thumbnail.
 */
function representativeFor(option: AppearanceOption): string | null {
  const templateId = option.templateIds[0];
  return (templateId ? hairstyleImageUrl(templateId) : null) ?? option.sampleImageUrl ?? null;
}

export default function PlanPage() {
  return (
    <SessionGate>
      <PlanContent />
    </SessionGate>
  );
}

function PlanContent() {
  const { id, token, session, refresh } = useSession();
  const [data, setData] = useState<OptionsResponse | null>(() =>
    id ? (cacheGet<OptionsResponse>(`options:${id}`) ?? null) : null
  );
  const [plan, setPlan] = useState<PlanSummary | null>(() =>
    id ? (cacheGet<PlanSummary>(`plan:${id}`) ?? null) : null
  );
  const [busySlot, setBusySlot] = useState<"planA" | "planB" | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id || !token) return;
    const optsKey = `options:${id}`;
    const planKey = `plan:${id}`;
    // Show last-known data immediately, then refresh quietly in the background.
    const cachedOpts = cacheGet<OptionsResponse>(optsKey);
    const cachedPlan = cacheGet<PlanSummary>(planKey);
    if (cachedOpts) setData(cachedOpts);
    if (cachedPlan) setPlan(cachedPlan);
    const [opts, planRes] = await Promise.all([api.getOptions(id, token), api.getPlan(id, token)]);
    cacheSet(optsKey, opts);
    cacheSet(planKey, planRes.plan);
    setData(opts);
    setPlan(planRes.plan);
  }, [id, token]);

  useEffect(() => {
    void load();
  }, [load]);

  async function choose(slot: "planA" | "planB", option: AppearanceOption) {
    if (!id || !token) return;
    setBusySlot(slot);
    const templateId = option.templateIds[0];
    const previewId = templateId
      ? session?.previews.find((p) => p.templateId === templateId && p.status === "success")?.id ?? null
      : null;
    // Persist the reference image + family so the saved plan card shows a visual
    // (the provider thumbnail in live mode) even with no generated preview.
    const entry = {
      label: option.label,
      optionId: option.id,
      previewId,
      imageUrl: representativeFor(option),
      family: option.family
    };
    await api.updatePlan(id, token, slot === "planA" ? { planA: entry } : { planB: entry });
    await refresh();
    await load();
    setBusySlot(null);
  }

  async function clear(slot: "planA" | "planB") {
    if (!id || !token) return;
    setBusySlot(slot);
    await api.updatePlan(id, token, slot === "planA" ? { planA: null } : { planB: null });
    await refresh();
    await load();
    setBusySlot(null);
  }

  /**
   * Link a freshly rendered preview to its plan slot, so the saved card, the summary,
   * and the PDF all show the real render on the user's photo (not just the reference
   * thumbnail). Called by a slot's preview control after a successful generation.
   */
  async function attachPreview(slot: "planA" | "planB", option: AppearanceOption, previewId: string) {
    if (!id || !token) return;
    const entry = {
      label: option.label,
      optionId: option.id,
      previewId,
      imageUrl: representativeFor(option),
      family: option.family
    };
    await api.updatePlan(id, token, slot === "planA" ? { planA: entry } : { planB: entry });
    await refresh();
    await load();
  }

  async function downloadSummary() {
    if (!id || !token || !plan || downloading) return;
    setDownloading(true);
    setPdfError(null);
    try {
      // Loaded on demand so the PDF library never runs during SSR and stays out
      // of the main bundle until the user actually asks for a download.
      const { downloadPlanPdf } = await import("@/lib/pdf");
      await downloadPlanPdf({ plan, previews: session?.previews ?? [], sessionId: id, token });
    } catch {
      setPdfError("We couldn't build that download just now. Your plan is still saved here — please try again.");
    } finally {
      setDownloading(false);
    }
  }

  const hasPlanA = Boolean(session?.plan.planA);

  return (
    <>
      <Header />
      <main className="shell-mid space-y-8 pb-24 pt-10 sm:pt-14">
        {/* Everything above the summary is an editor — on screen it's the working
            surface; on paper only the composed PlanSheet below is printed. */}
        <div className="no-print space-y-8">
          <SectionHeading
            eyebrow="Plan"
            title="Put your plan together"
            description="Choose a first preference, think through a backup, and keep any questions handy. You can change all of it whenever you like."
          />

          <Card className="bg-periwinkle-tint/40">
            <p className="text-[1.05rem] leading-relaxed text-body">
              {hasPlanA
                ? "Nice — Plan A is saved. If you like, choose a backup you'd also be comfortable with, and keep any questions for your care team handy."
                : "Start with whatever feels most like you right now. You can add a backup and any questions for your care team as you go."}
            </p>
          </Card>

          <PlanSlotCard
            title="Plan A — my first preference"
            description="Whatever feels most like you right now. It doesn't have to be permanent."
            slot="planA"
            options={data?.options ?? []}
            selectedId={session?.plan.planA?.optionId ?? null}
            busy={busySlot === "planA"}
            onChoose={choose}
            onClear={clear}
            onPreview={attachPreview}
          />

          <ScenarioRehearsal scenario={data?.scenario ?? null} enabled={hasPlanA} />

          <PlanSlotCard
            title="Plan B — a backup that's also okay"
            description="Something you'd be comfortable falling back on. Leaving it open is fine too."
            slot="planB"
            options={(data?.options ?? []).filter((o) => o.id !== session?.plan.planA?.optionId)}
            selectedId={session?.plan.planB?.optionId ?? null}
            busy={busySlot === "planB"}
            onChoose={choose}
            onClear={clear}
            onPreview={attachPreview}
          />

          <CareTeamQuestions
            onSaved={(updated) => {
              // The summary below must reflect a new question immediately — no reload.
              if (id) cacheSet(`plan:${id}`, updated);
              setPlan(updated);
            }}
          />
        </div>

        <div className="space-y-3">
          <div className="no-print flex flex-wrap items-end justify-between gap-3">
            <SectionHeading eyebrow="Summary" title="Your plan" />
            <Button
              variant="secondary"
              onClick={downloadSummary}
              loading={downloading}
              disabled={!plan || downloading}
              className="shrink-0"
            >
              {!downloading && (
                <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" aria-hidden>
                  <path
                    d="M10 3v9m0 0 3.2-3.2M10 12l-3.2-3.2M4 15.5h12"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              )}
              {downloading ? "Preparing…" : "Download summary (PDF)"}
            </Button>
          </div>
          {pdfError && (
            <p className="no-print text-sm text-coral" role="status">
              {pdfError}
            </p>
          )}
          {plan ? (
            <PlanSheet plan={plan} />
          ) : (
            <Card className="text-warmgray">Loading your summary…</Card>
          )}
        </div>
      </main>
    </>
  );
}

function PlanSlotCard({
  title,
  description,
  slot,
  options,
  selectedId,
  busy,
  onChoose,
  onClear,
  onPreview
}: {
  title: string;
  description: string;
  slot: "planA" | "planB";
  options: AppearanceOption[];
  selectedId: string | null;
  busy: boolean;
  onChoose: (slot: "planA" | "planB", option: AppearanceOption) => void;
  onClear: (slot: "planA" | "planB") => void;
  onPreview: (slot: "planA" | "planB", option: AppearanceOption, previewId: string) => void;
}) {
  const selectedOption = options.find((o) => o.id === selectedId) ?? null;
  return (
    <Card className="space-y-4">
      <SectionHeading title={title} description={description} />
      <div className="flex flex-wrap gap-2">
        {options.map((option) => {
          const active = selectedId === option.id;
          const img = representativeFor(option);
          return (
            <button
              key={option.id}
              type="button"
              disabled={busy}
              aria-pressed={active}
              onClick={() => onChoose(slot, option)}
              className={cx(
                "flex items-center gap-2.5 rounded-card border p-1.5 pr-3 text-left transition-colors",
                active
                  ? "border-periwinkle-deep bg-periwinkle-tint/50 ring-1 ring-periwinkle-deep"
                  : "border-line bg-surface hover:border-periwinkle/60"
              )}
            >
              {img && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={img}
                  alt={`Reference image for ${option.label}`}
                  className="h-12 w-9 shrink-0 rounded-sm border border-hairline object-cover object-top"
                />
              )}
              <span className="flex items-center gap-1.5">
                {active && <CheckMark className="h-3.5 w-3.5 shrink-0 text-periwinkle-deep" aria-hidden />}
                <span className="text-sm font-medium text-ink">{option.label}</span>
                {!option.visualizable && <span className="text-xs text-subtle">· described</span>}
              </span>
            </button>
          );
        })}
      </div>
      {/* A chosen, renderable style can be previewed on the user's photo right here
          — the same magical reveal as the gallery — and the render is linked back to
          this slot. Text-only looks (no template) simply have nothing to render. */}
      {selectedOption?.templateIds[0] && (
        <PlanSlotPreview
          key={selectedOption.id}
          option={selectedOption}
          onPreviewed={(previewId) => onPreview(slot, selectedOption, previewId)}
        />
      )}
      {selectedId && (
        <button
          type="button"
          onClick={() => onClear(slot)}
          disabled={busy}
          className="inline-flex min-h-[2.75rem] items-center rounded-md px-2 text-xs text-warmgray underline underline-offset-2 transition-colors hover:bg-ink/[0.04] hover:text-charcoal"
        >
          Clear this choice
        </button>
      )}
    </Card>
  );
}
