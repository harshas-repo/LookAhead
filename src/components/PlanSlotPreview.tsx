"use client";

/**
 * PlanSlotPreview — an on-demand preview for the style chosen in a Plan A / Plan B
 * slot, so a backup look can be rendered on the user's photo just like the gallery.
 *
 * It reuses prior results (a stored success shows immediately; an in-flight task
 * resumes polling so its already-spent credit isn't wasted), never auto-retries, and
 * is honest about failures. Once a render succeeds it reports the preview id up so
 * the saved plan entry links it (and the summary/PDF show the real render). Every
 * image is an illustration to help imagine a look — never a prediction.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiClientError } from "@/lib/api-client";
import type { PublicPreview } from "@/lib/api/serialize";
import { useSession } from "@/lib/session-context";
import { describeError } from "@/lib/labels";
import type { AppearanceOption } from "@/lib/types";
import { hairstyleImageUrl } from "@/lib/images";
import { PreviewLightbox, type LightboxTarget } from "@/components/PreviewLightbox";
import { Button, Spinner } from "@/components/ui";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
// Mirror the rehearsal surface: brisk polling first, then slower, over a long window
// so a queued task is never abandoned (its credits were already spent at creation).
const FAST_POLLS = 30;
const POLL_WINDOW_MS = 6 * 60 * 1000;

type Status = "idle" | "processing" | "success" | "failed";

/** The reference image for an option (provider thumbnail in live mode, else local art). */
function representativeFor(option: AppearanceOption): string | null {
  const templateId = option.templateIds[0];
  return (templateId ? hairstyleImageUrl(templateId) : null) ?? option.sampleImageUrl ?? null;
}

export function PlanSlotPreview({
  option,
  onPreviewed
}: {
  option: AppearanceOption;
  /** Called with a preview id once a render succeeds, so the plan entry can link it. */
  onPreviewed: (previewId: string) => void;
}) {
  const { id, token, session, refresh } = useSession();
  const templateId = option.templateIds[0];
  const photoRefId = session?.hairRecord.photoRef?.id ?? null;

  const [preview, setPreview] = useState<PublicPreview | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<LightboxTarget | null>(null);

  /** Preview ids with an active poll loop (prevents duplicate concurrent loops). */
  const polling = useRef<Set<string>>(new Set());
  /** True while this component is generating/resuming, so the seed effect won't clobber it. */
  const generating = useRef(false);
  const onPreviewedRef = useRef(onPreviewed);
  onPreviewedRef.current = onPreviewed;

  // Poll one preview to a terminal state (or the end of the long window).
  const poll = useCallback(
    async (initial: PublicPreview): Promise<PublicPreview> => {
      if (!id || !token || polling.current.has(initial.id)) return initial;
      polling.current.add(initial.id);
      let current = initial;
      setPreview(current);
      setStatus(current.status);
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
            // A 404 means the preview no longer exists server-side (orphaned or the
            // session was reset); stop instead of spinning forever. Other errors are
            // transient — keep the window running.
            if (err instanceof ApiClientError && err.status === 404) {
              current = { ...current, status: "failed", errorCode: err.code || "preview_not_found" };
              setPreview(current);
              setStatus("failed");
              setError("That preview is no longer available. Nothing was lost — you can try again.");
              break;
            }
            continue;
          }
          setPreview(current);
          setStatus(current.status);
        }
        return current;
      } finally {
        polling.current.delete(initial.id);
      }
    },
    [id, token]
  );

  // Reflect the stored preview for this template whenever we're not actively working:
  // a success shows at once, a failure is reported honestly, and an in-flight task
  // resumes polling (no new credit) then links itself on completion.
  useEffect(() => {
    if (!templateId || !session || generating.current) return;
    const stored = session.previews.find((p) => p.templateId === templateId);
    if (!stored) {
      setStatus("idle");
      setPreview(null);
      setError(null);
      return;
    }
    if (stored.status === "processing") {
      if (polling.current.has(stored.id)) return;
      generating.current = true;
      void poll(stored)
        .then(async (final) => {
          if (final.status === "success") {
            await refresh();
            onPreviewedRef.current(final.id);
          } else if (final.status === "failed") {
            setError(describeError(final.errorCode).title);
          }
        })
        .catch(() => undefined)
        .finally(() => {
          generating.current = false;
        });
      return;
    }
    setPreview(stored);
    setStatus(stored.status);
    setError(stored.status === "failed" ? describeError(stored.errorCode).title : null);
  }, [session, templateId, poll, refresh]);

  async function generate() {
    if (!id || !token || !photoRefId || !templateId || generating.current) return;
    generating.current = true;
    setError(null);
    setStatus("processing");
    try {
      const created = await api.createPreview(id, token, templateId, photoRefId);
      const final = await poll(created.preview);
      if (final.status === "success") {
        await refresh();
        onPreviewedRef.current(final.id);
      } else if (final.status === "failed") {
        setError(describeError(final.errorCode).title);
      } else {
        setError("This preview is taking longer than usual. It's still rendering — it will appear here when ready.");
      }
    } catch (err) {
      // Nothing rendered, so return to the idle state and explain (the button stays).
      setStatus("idle");
      setPreview(null);
      setError(
        err instanceof ApiClientError && err.code === "preview_limit_reached"
          ? err.message
          : err instanceof Error
            ? err.message
            : "That preview didn't go through. Nothing was lost."
      );
    } finally {
      generating.current = false;
    }
  }

  const previewUrl = status === "success" && preview && id && token ? api.previewUrl(id, token, preview.id) : null;
  const representativeUrl = representativeFor(option);

  return (
    <div className="rounded-card border border-hairline bg-paper/50 p-4">
      <div className="flex flex-wrap items-start gap-4">
        {/* ── Tile ─────────────────────────────────────────────── */}
        <div className="relative aspect-[4/5] w-28 shrink-0 overflow-hidden rounded-md border border-hairline bg-surface sm:w-32">
          {status === "success" && previewUrl ? (
            <button
              type="button"
              onClick={() => setLightbox({ src: previewUrl, label: `Preview of ${option.label}` })}
              aria-label={`Enlarge preview of ${option.label}`}
              className="h-full w-full cursor-zoom-in"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={previewUrl}
                alt={`Preview of ${option.label}`}
                className="magic-materialize h-full w-full object-contain"
              />
            </button>
          ) : status === "processing" ? (
            <div className="magic-reveal grid h-full w-full place-items-center">
              <span className="magic-sweep" aria-hidden />
              <span className="relative z-10 grid h-10 w-10 place-items-center">
                <span className="absolute inset-0 animate-ping rounded-full bg-periwinkle/25" aria-hidden />
                <Spinner className="relative h-4 w-4 text-periwinkle-deep" />
              </span>
            </div>
          ) : representativeUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={representativeUrl}
              alt={`Sample image of ${option.label}`}
              className="h-full w-full object-cover object-top"
            />
          ) : (
            <div className="grid h-full w-full place-items-center border border-dashed border-hairline bg-paper/60" />
          )}
        </div>

        {/* ── Actions + honest copy ────────────────────────────── */}
        <div className="min-w-[13rem] flex-1 space-y-2.5">
          <p className="label">Preview this look</p>
          {status === "success" && previewUrl ? (
            <>
              <p className="text-sm leading-relaxed text-body/80">
                Rendered on your photo — an illustration to help you imagine it, never a prediction.
              </p>
              <Button
                size="sm"
                variant="primary"
                onClick={() => setLightbox({ src: previewUrl, label: `Preview of ${option.label}` })}
              >
                View full size
              </Button>
            </>
          ) : status === "processing" ? (
            <p className="text-sm leading-relaxed text-body/80">Rendering your preview… this can take a moment.</p>
          ) : (
            <>
              <p className="text-sm leading-relaxed text-body/80">
                {photoRefId
                  ? "See this look on your own photo to help you picture it. Nothing is generated until you ask."
                  : "Add a photo in Prepare to preview this look on you."}
              </p>
              <Button size="sm" variant="primary" onClick={generate} disabled={!photoRefId || !id || !token}>
                {status === "failed" ? "Try again" : "Generate preview"}
              </Button>
            </>
          )}
          {error && (
            <p className="text-xs leading-relaxed text-[#a4482f]" role="status">
              {error}
            </p>
          )}
        </div>
      </div>

      {lightbox && <PreviewLightbox target={lightbox} onClose={() => setLightbox(null)} />}
    </div>
  );
}
