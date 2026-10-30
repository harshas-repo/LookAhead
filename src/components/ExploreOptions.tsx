"use client";

/**
 * ExploreOptions — the rehearsal surface (brief §6: the core visual experience).
 *
 * Personalized previews are the main visual content, shown in a responsive,
 * image-led gallery with consistent square framing (cropped from the top so faces
 * aren't distorted), clear selection states, tasteful loading placeholders, and
 * honest error handling — a failed call is never dressed up as a success.
 *
 * EVERY option is previewable now, drawn from four try-on families (hairstyle,
 * extension/wig, bangs, volume) and grouped under small headings. An opt-in
 * "Suggested looks" panel stays empty until the user picks a preference and asks;
 * a deterministic engine then surfaces three female hairstyle ideas as LIVE preview
 * cards in the panel itself — the same card, magical reveal, and actions as the
 * gallery below — and excludes them from the Hairstyles group while the suggestion
 * is active, so they're never duplicated. It never removes choice or predicts
 * anything, and the panel (with its chosen preference) persists across in-app
 * navigation. Preview state is keyed by OPTION id (not a bare template id) so
 * identical template ids across families can't collide. Previews are unlimited by
 * default; the server still reuses prior results and this UI never auto-retries.
 */

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { api, ApiClientError, type OptionsResponse } from "@/lib/api-client";
import { cacheGet, cacheSet } from "@/lib/client-cache";
import type { PublicPreview } from "@/lib/api/serialize";
import { useSession } from "@/lib/session-context";
import { describeError } from "@/lib/labels";
import { TRY_ON_FAMILIES, type AppearanceOption, type HairDensityTerm, type HairLength } from "@/lib/types";
import { FAMILY_GROUP_LABEL, optionIdFor } from "@/lib/decision/options";
import {
  LOOK_PREFERENCES,
  suggestHairstyles,
  type LookPreference,
  type SuggestionResult
} from "@/lib/decision/recommend";
import Image from "next/image";
import { CheckMark } from "@/components/art";
import { hairstyleImageUrl } from "@/lib/images";
import { PreviewLightbox, type LightboxTarget } from "@/components/PreviewLightbox";
import { Badge, Button, Card, Notice, ProgressBar, Spinner, cx } from "@/components/ui";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
// Live tasks usually finish in seconds, but the provider can queue one for minutes.
// Poll briskly (1s) for the first 30s, then every 3s, for up to 6 minutes total —
// and resume polling for in-flight previews when the page is revisited, so a slow
// task is never abandoned (its credits were already spent at creation).
const FAST_POLLS = 30;
const POLL_WINDOW_MS = 6 * 60 * 1000;

interface PreviewState {
  status: "processing" | "success" | "failed";
  preview: PublicPreview;
}

/** What a runPreview call resulted in — lets previewAll() stop cleanly at the budget. */
type PreviewOutcome = "created" | "reused" | "limit" | "error" | "skipped";

export function ExploreOptions({ onChosenPlanA }: { onChosenPlanA?: () => void }) {
  const { id, token, session, refresh } = useSession();
  const [data, setData] = useState<OptionsResponse | null>(() =>
    id ? (cacheGet<OptionsResponse>(`options:${id}`) ?? null) : null
  );
  // Keyed by OPTION id (family-aware), never a bare template id.
  const [previews, setPreviews] = useState<Record<string, PreviewState>>({});
  // A SET of busy option ids (not a single key) so several previews can render at
  // once — "Preview all" fires every suggested look in parallel.
  const [busyKeys, setBusyKeys] = useState<Set<string>>(() => new Set());
  const [notice, setNotice] = useState<{ tone: "info" | "warn"; text: string } | null>(null);
  const [lightbox, setLightbox] = useState<LightboxTarget | null>(null);
  // Live budget, updated the instant a preview is created so the bar moves in
  // real time rather than waiting for a reload.
  const [liveBudget, setLiveBudget] = useState<{ used: number; max: number } | null>(null);
  // Opt-in "Suggested looks" panel state. The preference + whether results are
  // shown persist across in-app navigation via the client cache, so revisiting the
  // page keeps the suggested section exactly as the user left it. This is ephemeral
  // UI state only — never written to the profile/server.
  const suggestKey = id ? `suggest:${id}` : null;
  const cachedSuggest = suggestKey
    ? cacheGet<{ preference: LookPreference | null; showResult: boolean }>(suggestKey)
    : null;
  const [preference, setPreference] = useState<LookPreference | null>(cachedSuggest?.preference ?? null);
  const [showResult, setShowResult] = useState<boolean>(cachedSuggest?.showResult ?? false);
  const [suggestion, setSuggestion] = useState<SuggestionResult | null>(null);
  const [previewingAll, setPreviewingAll] = useState(false);
  const cancelled = useRef(false);
  /** Preview ids with an active poll loop (prevents duplicate concurrent loops). */
  const activePolls = useRef<Set<string>>(new Set());
  /** In-flight previews we've already resumed polling once this page load. */
  const resumed = useRef<Set<string>>(new Set());
  /** Mirrors of state read inside async loops (avoids stale closures). */
  const previewsRef = useRef<Record<string, PreviewState>>({});
  const budgetRef = useRef({ used: 0, max: 0 });

  // Add/remove an option id from the busy set (immutable so React re-renders).
  const markBusy = (key: string) => setBusyKeys((s) => (s.has(key) ? s : new Set(s).add(key)));
  const clearBusy = (key: string) =>
    setBusyKeys((s) => {
      if (!s.has(key)) return s;
      const next = new Set(s);
      next.delete(key);
      return next;
    });

  // A suggestion is only "active" (badged, excluded from the gallery, shown in the
  // panel) while the user is viewing results; "Adjust" flips showResult off and
  // returns every look to the gallery with the preference still selected.
  const activeSuggestion = showResult ? suggestion : null;

  const photoRefId = session?.hairRecord.photoRef?.id ?? null;
  const budgetMax = liveBudget?.max ?? data?.previewBudgetMax ?? session?.previewBudgetMax ?? 4;
  const budgetUsed = liveBudget?.used ?? data?.previewBudgetUsed ?? session?.previewBudgetUsed ?? 0;

  // What the hair record tells us about the hair in the photos TODAY (never a
  // prediction) — this is the only extra signal the opt-in suggestion engine uses.
  // A user correction always wins over raw detection, matching the record card.
  const hairRecord = session?.hairRecord ?? null;
  const recordLength: HairLength | null =
    hairRecord?.analysis?.userCorrection ??
    (hairRecord?.analysis?.status === "success" ? hairRecord.analysis.length : null);
  const recordDensity: HairDensityTerm | null =
    hairRecord?.density?.status === "success" ? hairRecord.density.term : null;
  const recordType: string | null = hairRecord?.type?.status === "success" ? hairRecord.type.term : null;
  const hasHairRecord =
    (recordLength !== null && recordLength !== "unknown") || recordType !== null || recordDensity !== null;
  // The user's optional treatment date drives only the gentle "where you are"
  // timing note in suggestions — never a prediction.
  const treatmentDate = session?.profile.optionalTreatmentDate ?? null;

  // Load curated options + scenario + recommendation.
  useEffect(() => {
    if (!id || !token) return;
    cancelled.current = false;
    const key = `options:${id}`;
    const cached = cacheGet<OptionsResponse>(key);
    if (cached) setData(cached);
    api
      .getOptions(id, token)
      .then((res) => {
        if (!cancelled.current) {
          cacheSet(key, res);
          setData(res);
        }
      })
      .catch(() => setNotice({ tone: "warn", text: "We couldn't load your options. Please refresh." }));
    return () => {
      cancelled.current = true;
    };
  }, [id, token]);

  // Seed previews from the persisted session so returning users see prior results.
  // A stored preview maps back to its option id via (family, templateId).
  useEffect(() => {
    if (!session) return;
    setPreviews((prev) => {
      const next = { ...prev };
      for (const p of session.previews) {
        const key = optionIdFor(p.family ?? "hairstyle", p.templateId);
        if (!next[key] || next[key].status === "processing") {
          next[key] = { status: p.status, preview: p };
        }
      }
      return next;
    });
  }, [session]);

  // Keep the async-loop mirrors fresh so previewAll() never re-charges an option
  // that already rendered and never exceeds the live budget.
  useEffect(() => {
    previewsRef.current = previews;
  }, [previews]);
  useEffect(() => {
    budgetRef.current = { used: budgetUsed, max: budgetMax };
  }, [budgetUsed, budgetMax]);

  // Persist the panel's ephemeral UI state so in-app navigation keeps it. Cleared
  // with the rest of the cache on privacy reset (cacheClear), never sent anywhere.
  useEffect(() => {
    if (suggestKey) cacheSet(suggestKey, { preference, showResult });
  }, [suggestKey, preference, showResult]);

  // Restore a suggestion after navigation: the component remounts with the cached
  // { preference, showResult } but no computed result, so recompute it (pure and
  // deterministic) once options are present and the user was viewing results.
  useEffect(() => {
    if (!data || !showResult || !preference) return;
    setSuggestion(
      (prev) =>
        prev ??
        suggestHairstyles({
          options: data.options,
          preference,
          length: recordLength,
          density: recordDensity,
          type: recordType,
          treatmentDate
        })
    );
  }, [data, showResult, preference, recordLength, recordDensity, recordType, treatmentDate]);

  // Poll one preview until it reaches a terminal state or the long window ends.
  // Shared by freshly created previews and resumed in-flight ones. `key` is the
  // option id the result belongs to.
  const pollLoop = useCallback(
    async (key: string, initial: PublicPreview): Promise<PublicPreview> => {
      if (!id || !token || activePolls.current.has(initial.id)) return initial;
      activePolls.current.add(initial.id);
      let current = initial;
      setPreviews((p) => ({ ...p, [key]: { status: current.status, preview: current } }));
      try {
        const startedAt = Date.now();
        let polls = 0;
        while (current.status === "processing" && Date.now() - startedAt < POLL_WINDOW_MS) {
          await sleep(polls < FAST_POLLS ? 1000 : 3000);
          polls += 1;
          try {
            const res = await api.pollPreview(id, token, current.id);
            current = res.preview;
          } catch (err) {
            // A 404 means this preview no longer exists server-side (orphaned by an
            // interrupted write, or the session was reset). Re-polling can never
            // succeed, so stop and mark it failed instead of spinning for 6 minutes.
            if (err instanceof ApiClientError && err.status === 404) {
              current = { ...current, status: "failed", errorCode: err.code || "preview_not_found" };
              setPreviews((p) => ({ ...p, [key]: { status: "failed", preview: current } }));
              break;
            }
            continue; // transient poll hiccup — keep the window running
          }
          setPreviews((p) => ({ ...p, [key]: { status: current.status, preview: current } }));
        }
        return current;
      } finally {
        activePolls.current.delete(initial.id);
      }
    },
    [id, token]
  );

  // Resume polling for previews still processing (e.g. the page was revisited
  // while the provider was still working) — the result appears without spending
  // another credit, because the poll route reuses the existing task.
  useEffect(() => {
    if (!session || !id || !token) return;
    for (const p of session.previews) {
      if (p.status !== "processing" || resumed.current.has(p.id)) continue;
      resumed.current.add(p.id);
      const key = optionIdFor(p.family ?? "hairstyle", p.templateId);
      markBusy(key);
      void pollLoop(key, p)
        .then(async (current) => {
          if (current.status === "processing") {
            setNotice({
              tone: "info",
              text: "Your preview is still rendering in the background — it will appear here when ready."
            });
          }
          await refresh();
        })
        .catch(() => undefined)
        .finally(() => clearBusy(key));
    }
  }, [session, id, token, pollLoop, refresh]);

  const runPreview = useCallback(
    async (option: AppearanceOption): Promise<PreviewOutcome> => {
      const templateId = option.templateIds[0];
      if (!id || !token || !photoRefId || !templateId) return "skipped";
      const key = option.id;
      setNotice(null);
      markBusy(key);
      try {
        const created = await api.createPreview(id, token, templateId, photoRefId);
        // The budget is charged up front, so reflect it immediately. (A reused
        // preview isn't re-charged and omits these fields — guard for that.) With
        // parallel "Preview all" several creates resolve out of order, so accumulate
        // the HIGH-WATER mark rather than trusting the latest response alone.
        const charged = typeof created.previewBudgetUsed === "number";
        if (charged) {
          const next = {
            used: Math.max(budgetRef.current.used, created.previewBudgetUsed),
            max: created.previewBudgetMax
          };
          budgetRef.current = next;
          setLiveBudget(next);
        }

        const current = await pollLoop(key, created.preview);
        if (current.status === "processing") {
          setNotice({
            tone: "info",
            text: "This preview is taking longer than usual. It's still rendering — it will appear here when ready."
          });
        }
        await refresh(); // sync persisted budget + stored output image
        return charged ? "created" : "reused";
      } catch (err) {
        if (err instanceof ApiClientError && err.code === "preview_limit_reached") {
          setNotice({ tone: "info", text: err.message });
          return "limit";
        }
        setNotice({
          tone: "warn",
          text: err instanceof Error ? err.message : "That preview didn't go through. Nothing was lost."
        });
        return "error";
      } finally {
        clearBusy(key);
      }
    },
    [id, token, photoRefId, refresh, pollLoop]
  );

  /**
   * The reference image shown on a card before any preview is generated. In live
   * mode this is the provider's own sample thumbnail for that (female-presenting)
   * look — the real YouCam image, never an AI illustration. Only mock ids, which
   * have no provider thumbnail, fall back to their local editorial illustration.
   * Generated previews still show the true render on the user's photo.
   */
  function representativeFor(option: AppearanceOption): string | null {
    const templateId = option.templateIds[0];
    return (templateId ? hairstyleImageUrl(templateId) : null) ?? option.sampleImageUrl ?? null;
  }

  async function choosePlanA(option: AppearanceOption) {
    if (!id || !token) return;
    const previewId = previews[option.id]?.preview.id ?? null;
    await api.updatePlan(id, token, {
      planA: {
        label: option.label,
        optionId: option.id,
        previewId,
        // Carry the same reference image the card shows (the provider thumbnail in
        // live mode) so the plan stays visual even with no generated preview.
        imageUrl: representativeFor(option),
        family: option.family
      }
    });
    await refresh();
    onChosenPlanA?.();
  }

  /** Compute the opt-in suggestions from the loaded options + the hair record. */
  function suggestNow(pref: LookPreference) {
    if (!data) return;
    setSuggestion(
      suggestHairstyles({
        options: data.options,
        preference: pref,
        length: recordLength,
        density: recordDensity,
        type: recordType,
        treatmentDate
      })
    );
    setShowResult(true);
  }

  /** "Adjust" — return to the preference chips, keeping the choice, hiding results. */
  function adjustSuggestion() {
    setShowResult(false);
  }

  /**
   * On-demand "Preview all": render every suggested look that isn't already done
   * IN PARALLEL, so all the generations start at the same time and each card shows
   * its own progress. Prior/in-flight results are still reused (nothing is
   * double-charged) and the server enforces any positive cap, so firing at once is
   * safe. Previews are unlimited by default. Never runs on load.
   */
  async function previewAll() {
    if (!data || !activeSuggestion) return;
    const byId = new Map(data.options.map((o) => [o.id, o]));
    // Collect the looks that still need rendering, deduplicated, skipping any that
    // already succeeded so we never spend another credit on them.
    const targets: AppearanceOption[] = [];
    const handled = new Set<string>();
    for (const item of activeSuggestion.items) {
      const option = byId.get(item.optionId);
      if (!option || handled.has(option.id)) continue;
      if (previewsRef.current[option.id]?.status === "success") continue;
      handled.add(option.id);
      targets.push(option);
    }
    if (targets.length === 0) return;
    setPreviewingAll(true);
    try {
      // Start them all together rather than one after another.
      await Promise.all(targets.map((option) => runPreview(option)));
    } finally {
      setPreviewingAll(false);
    }
  }

  if (!data) {
    // Calm skeleton (only ever seen if the first-ever fetch is still in flight —
    // the session provider warms this cache, so navigation renders instantly).
    return (
      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3" aria-busy="true" aria-label="Loading your options">
        {[0, 1, 2].map((i) => (
          <div key={i} className="overflow-hidden rounded-card border border-hairline bg-surface">
            <div className="aspect-square w-full animate-pulse bg-ink/[0.04]" />
            <div className="space-y-2.5 p-5">
              <div className="h-4 w-2/3 animate-pulse rounded bg-ink/[0.06]" />
              <div className="h-3 w-full animate-pulse rounded bg-ink/[0.04]" />
              <div className="h-3 w-4/5 animate-pulse rounded bg-ink/[0.04]" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  const chosenPlanA = session?.plan.planA?.optionId ?? null;
  // Previews are unlimited by default (budgetMax <= 0); a positive cap re-imposes
  // the limit as a cost escape hatch, and only then can a card be "at limit".
  const unlimited = budgetMax <= 0;
  const atLimit = !unlimited && budgetUsed >= budgetMax;

  // Badges + the exclusion are driven purely by the ACTIVE suggestion — nothing is
  // highlighted (and no look is hidden from its group) until the user views results.
  const suggestedIds = new Set(activeSuggestion?.items.map((i) => i.optionId) ?? []);
  const suggestedReasons = new Map<string, string>(activeSuggestion?.items.map((i) => [i.optionId, i.reason]) ?? []);
  // The suggested looks, in suggestion order, rendered as live preview cards in the
  // panel via the SAME renderOptionCard used by the gallery below.
  const suggestedOptions = (activeSuggestion?.items ?? [])
    .map((i) => data.options.find((o) => o.id === i.optionId))
    .filter((o): o is AppearanceOption => Boolean(o));

  // Group the (server-ordered) options by family so the grid reads as tidy sections.
  // While a suggestion is active its looks live ONLY in the panel, so exclude them
  // here to avoid duplication; otherwise the server's ordering is left untouched.
  const groups = TRY_ON_FAMILIES.map((family) => {
    const opts = data.options.filter((o) => (o.family ?? "hairstyle") === family);
    const visible = suggestedIds.size > 0 ? opts.filter((o) => !suggestedIds.has(o.id)) : opts;
    return { family, label: FAMILY_GROUP_LABEL[family], options: visible };
  }).filter((g) => g.options.length > 0);

  // "Preview all" is on-demand only: it counts just the suggested looks not already
  // rendered. With unlimited previews (the default) that's every remaining look; a
  // positive cap still bounds it.
  const suggestedRemaining =
    activeSuggestion?.items.filter((i) => previews[i.optionId]?.status !== "success").length ?? 0;
  const remainingBudget = unlimited ? Number.POSITIVE_INFINITY : Math.max(0, budgetMax - budgetUsed);
  const previewAllCount = Math.min(suggestedRemaining, remainingBudget);
  const previewAllDisabled = !photoRefId || previewingAll || previewAllCount === 0;
  const suggestedCount = activeSuggestion?.items.length ?? 0;
  const previewAllLabel = !activeSuggestion
    ? ""
    : suggestedRemaining === 0
      ? `All ${suggestedCount} previews ready`
      : previewAllCount === 0
        ? "Preview limit reached"
        : `Preview all ${suggestedCount}`;
  const previewAllHint = !activeSuggestion
    ? null
    : !photoRefId
      ? "Previews need a photo — add one in Prepare."
      : previewAllCount === 0 && suggestedRemaining > 0
        ? "You've reached your preview limit. You can still choose any suggested look as your Plan A."
        : null;

  function renderOptionCard(option: AppearanceOption) {
    const templateId = option.templateIds[0];
    const key = option.id;
    const state = previews[key];
    const isChosen = chosenPlanA === option.id;
    const busy = busyKeys.has(key);
    const suggested = suggestedIds.has(option.id);
    const reason = suggestedReasons.get(option.id);
    const previewUrl = state?.status === "success" && id && token ? api.previewUrl(id, token, state.preview.id) : null;
    const representativeUrl = representativeFor(option);

    return (
      <Card
        key={option.id}
        as="article"
        className={cx(
          "flex flex-col gap-0 overflow-hidden p-0 transition-shadow duration-200",
          isChosen ? "shadow-lift ring-2 ring-periwinkle-deep" : "hover:shadow-lift"
        )}
      >
        {/* ── Media ─────────────────────────────────────────────── */}
        <div className="relative aspect-square w-full overflow-hidden bg-paper">
          <PreviewMedia
            label={option.label}
            state={state}
            busy={busy}
            atLimit={atLimit}
            previewUrl={previewUrl}
            representativeUrl={representativeUrl}
            onZoom={previewUrl ? () => setLightbox({ src: previewUrl, label: `Preview of ${option.label}` }) : undefined}
          />

          {isChosen && (
            <span className="absolute left-3 top-3">
              <Badge tone="sage">
                <CheckMark className="h-3.5 w-3.5" aria-hidden /> Plan A
              </Badge>
            </span>
          )}
          {suggested && (
            <span className="absolute right-3 top-3">
              <Badge tone="lavender" title={reason}>
                Suggested
              </Badge>
            </span>
          )}
        </div>

        {/* ── Body ──────────────────────────────────────────────── */}
        <div className="flex flex-1 flex-col gap-4 p-5">
          <div className="space-y-1">
            <h3 className="font-display text-title text-ink">{option.label}</h3>
            <p className="text-sm leading-relaxed text-body/75">{option.description}</p>
          </div>

          {state?.status === "failed" && (
            <p className="text-xs text-[#a4482f]">{describeError(state.preview.errorCode).title}</p>
          )}

          <div className="mt-auto flex flex-wrap items-center gap-2">
            {/* Primary action: the preview. Render -> "Generate preview" /
                "Rendering…" / "Try again"; rendered -> "View full size". */}
            {templateId &&
              (state?.status === "success" && previewUrl ? (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => setLightbox({ src: previewUrl, label: `Preview of ${option.label}` })}
                >
                  View full size
                </Button>
              ) : (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => runPreview(option)}
                  disabled={busy || !photoRefId || atLimit}
                >
                  {state?.status === "failed" ? "Try again" : busy ? "Rendering…" : "Generate preview"}
                </Button>
              ))}

            {/* Secondary action: choose this look as Plan A. For text-only options
                with nothing to render, choosing is the primary action instead. */}
            <Button
              variant={templateId ? "secondary" : "primary"}
              size="sm"
              onClick={() => choosePlanA(option)}
              disabled={!id || !token}
            >
              {isChosen ? (
                <>
                  <CheckMark className="h-4 w-4" aria-hidden /> Plan A chosen
                </>
              ) : (
                "Choose as Plan A"
              )}
            </Button>
          </div>

          {/* Every disabled preview button explains itself on its own card. */}
          {state?.status !== "success" && !photoRefId && (
            <p className="text-xs leading-relaxed text-subtle">
              Needs a photo to render on you —{" "}
              <Link href="/prepare" className="link-quiet">
                add one in Prepare
              </Link>
              .
            </p>
          )}
          {atLimit && state?.status !== "success" && photoRefId && (
            <p className="text-xs leading-relaxed text-subtle">
              You&apos;ve used all your previews. You can still choose this look as your Plan A, or view any preview
              you&apos;ve already rendered.
            </p>
          )}
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 border-b border-hairline pb-5 sm:flex-row sm:items-end sm:justify-between">
        <p className="max-w-md text-sm leading-relaxed text-subtle">
          Previews are simulations to help you imagine a look — never a prediction of how you will look. You can choose
          any option as your Plan A, with or without a preview.
        </p>
        <div className="w-full sm:max-w-[15rem]">
          {unlimited ? (
            <p className="text-sm leading-relaxed text-subtle">
              {budgetUsed} {budgetUsed === 1 ? "preview" : "previews"} generated
            </p>
          ) : (
            <ProgressBar value={budgetUsed} max={budgetMax} label="Previews used" />
          )}
        </div>
      </div>

      {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}

      {!photoRefId && (
        <Notice tone="info">
          Previews need a photo.{" "}
          <Link href="/prepare" className="link-quiet">
            Add one in Prepare
          </Link>{" "}
          — you can still choose any option below as your Plan A without a preview.
        </Notice>
      )}

      <SuggestedPanel
        preference={preference}
        onPreference={setPreference}
        onSuggest={() => preference && suggestNow(preference)}
        onAdjust={adjustSuggestion}
        suggestion={activeSuggestion}
        suggestedOptions={suggestedOptions}
        renderCard={renderOptionCard}
        hasRecord={hasHairRecord}
        previewAllLabel={previewAllLabel}
        previewAllDisabled={previewAllDisabled}
        previewAllHint={previewAllHint}
        previewingAll={previewingAll}
        onPreviewAll={previewAll}
      />

      {groups.length === 0 && (
        <Notice tone="info">No looks loaded just yet. Please refresh — nothing was lost.</Notice>
      )}

      {groups.map((group) => (
        <section key={group.family} className="space-y-3.5">
          <div className="flex items-baseline gap-3">
            <h2 className="font-display text-title text-ink">{group.label}</h2>
            <span className="h-px flex-1 bg-hairline" aria-hidden />
          </div>
          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">{group.options.map(renderOptionCard)}</div>
        </section>
      ))}

      {lightbox && <PreviewLightbox target={lightbox} onClose={() => setLightbox(null)} />}
    </div>
  );
}

/* ── Suggested looks (opt-in) ───────────────────────────────────────────────
 * Empty until the user picks a preference and presses "Suggest looks". The result
 * renders the three suggested looks as LIVE preview cards (the same renderCard the
 * gallery uses — magical reveal, generate/rendering/view/try-again, choose as
 * Plan A, click-to-zoom, "Suggested" badge), a gentle timing note when a treatment
 * date is set, plus "things to consider" and "mixes" copy, and an on-demand
 * "Preview all". Previews are unlimited by default; a positive cap still applies. */
interface SuggestedPanelProps {
  preference: LookPreference | null;
  onPreference: (p: LookPreference) => void;
  onSuggest: () => void;
  onAdjust: () => void;
  suggestion: SuggestionResult | null;
  /** The suggested options, in suggestion order, to render as live preview cards. */
  suggestedOptions: AppearanceOption[];
  /** The gallery's card renderer, so a suggested card behaves identically. */
  renderCard: (option: AppearanceOption) => ReactNode;
  hasRecord: boolean;
  previewAllLabel: string;
  previewAllDisabled: boolean;
  previewAllHint: string | null;
  previewingAll: boolean;
  onPreviewAll: () => void;
}

function SuggestedPanel({
  preference,
  onPreference,
  onSuggest,
  onAdjust,
  suggestion,
  suggestedOptions,
  renderCard,
  hasRecord,
  previewAllLabel,
  previewAllDisabled,
  previewAllHint,
  previewingAll,
  onPreviewAll
}: SuggestedPanelProps) {
  return (
    <section
      className="rounded-card border border-periwinkle/25 bg-periwinkle-tint/40 p-5 sm:p-6"
      aria-labelledby="suggested-looks-heading"
    >
      <div className="flex items-baseline gap-3">
        <h2 id="suggested-looks-heading" className="font-display text-title text-ink">
          Suggested looks
        </h2>
        <span className="h-px flex-1 bg-periwinkle/25" aria-hidden />
      </div>

      {!suggestion ? (
        <div className="mt-3 space-y-4">
          <p className="max-w-prose text-sm leading-relaxed text-body/80">
            Choose how far you&apos;d like to stray from your hair today, then press Suggest. We&apos;ll pick three
            female hairstyle ideas and explain what to consider — nothing is generated until you ask.
          </p>

          <div className="flex flex-wrap gap-2" role="group" aria-label="Look preference">
            {LOOK_PREFERENCES.map((p) => (
              <button
                key={p.id}
                type="button"
                className="chip flex-col items-start gap-0.5 text-left"
                aria-pressed={preference === p.id}
                onClick={() => onPreference(p.id)}
              >
                <span className="font-medium">{p.label}</span>
                <span className="text-xs text-subtle">{p.hint}</span>
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={onSuggest} disabled={!preference}>
              Suggest looks
            </Button>
            {!hasRecord && (
              <p className="max-w-sm text-xs leading-relaxed text-subtle">
                No hair record yet — we&apos;ll suggest from the catalog.{" "}
                <Link href="/prepare" className="link-quiet">
                  Add photos in Prepare
                </Link>{" "}
                for picks tailored to your length, density, and type.
              </p>
            )}
          </div>
        </div>
      ) : (
        <div className="mt-3 space-y-5">
          {suggestion.timingNote && (
            <div className="rounded-lg border border-lavender-soft/50 bg-lavender-soft/20 px-3.5 py-2.5">
              <p className="label mb-1 text-lavender-deep">Where you are</p>
              <p className="text-sm leading-relaxed text-body/85">{suggestion.timingNote}</p>
            </div>
          )}

          <p className="max-w-prose text-sm leading-relaxed text-body/85">{suggestion.headline}</p>

          {suggestedOptions.length > 0 ? (
            <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">{suggestedOptions.map(renderCard)}</div>
          ) : (
            <p className="text-sm text-subtle">No hairstyle ideas matched — try a different preference.</p>
          )}

          <div className="grid gap-5 sm:grid-cols-2">
            <div className="space-y-1.5">
              <p className="label">Things to consider</p>
              <ul className="list-disc space-y-1 pl-5 text-sm leading-relaxed text-body/80">
                {suggestion.considerations.map((c, i) => (
                  <li key={i}>{c}</li>
                ))}
              </ul>
            </div>
            <div className="space-y-1.5">
              <p className="label">Mixing it up</p>
              <p className="text-sm leading-relaxed text-body/80">{suggestion.mixes}</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 border-t border-periwinkle/20 pt-4">
            <Button onClick={onPreviewAll} disabled={previewAllDisabled} loading={previewingAll}>
              {previewAllLabel}
            </Button>
            <Button variant="ghost" onClick={onAdjust} disabled={previewingAll}>
              Adjust
            </Button>
            {previewAllHint && <p className="max-w-sm text-xs leading-relaxed text-subtle">{previewAllHint}</p>}
          </div>
        </div>
      )}
    </section>
  );
}

/** The square media tile for an option, across every preview state. */
function PreviewMedia({
  label,
  state,
  busy,
  atLimit,
  previewUrl,
  representativeUrl,
  onZoom
}: {
  label: string;
  state: PreviewState | undefined;
  busy: boolean;
  atLimit: boolean;
  previewUrl: string | null;
  representativeUrl: string | null;
  onZoom?: () => void;
}) {
  if (state?.status === "success" && previewUrl) {
    return (
      <button
        type="button"
        onClick={onZoom}
        disabled={!onZoom}
        aria-label={`Enlarge preview of ${label}`}
        className="group relative h-full w-full cursor-zoom-in"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={previewUrl}
          alt={`Preview of ${label}`}
          className="magic-materialize h-full w-full object-contain"
        />
        <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink/60 to-transparent px-3 pb-2.5 pt-8 text-left text-[0.7rem] font-medium text-paper">
          Rendered on your photo · click to enlarge
        </span>
      </button>
    );
  }

  if (state?.status === "processing" || busy) {
    return (
      <div className="magic-reveal grid h-full w-full place-items-center">
        <span className="magic-sweep" aria-hidden />
        <span className="relative z-10 flex flex-col items-center gap-2 text-sm">
          <span className="relative grid h-12 w-12 place-items-center">
            <span className="absolute inset-0 animate-ping rounded-full bg-periwinkle/25" aria-hidden />
            <Spinner className="relative h-5 w-5 text-periwinkle-deep" />
          </span>
          <span className="rounded-full bg-surface/85 px-3 py-1 font-medium text-periwinkle-deep">
            Rendering your preview…
          </span>
        </span>
      </div>
    );
  }

  if (state?.status === "failed") {
    return (
      <div className="relative h-full w-full">
        {representativeUrl && <RepresentativeImage src={representativeUrl} alt="" className="opacity-30 saturate-50" />}
        <div className="absolute inset-0 grid place-items-center bg-coral/[0.06] px-6 text-center">
          <div className="space-y-1">
            <p className="text-sm text-[#a4482f]">This one didn&apos;t render.</p>
            <p className="text-xs text-subtle">Nothing was lost — you can try again.</p>
          </div>
        </div>
      </div>
    );
  }

  // Not yet previewed — show the representative illustration with an honest caption.
  return (
    <div className="relative h-full w-full">
      {representativeUrl ? (
        <RepresentativeImage src={representativeUrl} alt={`Sample image of ${label}`} />
      ) : (
        <div className="grid h-full w-full place-items-center border border-dashed border-hairline bg-paper/60" />
      )}
      <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink/60 to-transparent px-3 pb-2.5 pt-8 text-[0.7rem] font-medium text-paper">
        {atLimit ? "Preview limit reached" : "Sample look · preview to render it on your photo"}
      </span>
    </div>
  );
}

/**
 * Representative style image: the provider's own sample thumbnail (a remote CDN URL)
 * uses a plain <img> so no remote-domain config is needed and any CDN host the
 * provider uses just works; local mock illustrations go through next/image.
 */
function RepresentativeImage({ src, alt, className }: { src: string; alt: string; className?: string }) {
  if (src.startsWith("http")) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={src} alt={alt} className={cx("absolute inset-0 h-full w-full object-cover object-top", className)} />
    );
  }
  return <Image src={src} alt={alt} fill className={cx("object-cover object-top", className)} />;
}
