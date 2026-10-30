"use client";

/**
 * Welcome screen (`/`) — the calm front door.
 *
 * An editorial, asymmetric introduction: an expressive headline and one clear
 * action on the left, a custom mirror/reflection composition on the right, then a
 * ruled "how it works" rail. Sets expectations honestly (planning, not prediction;
 * not medical advice) and starts or resumes an anonymous session.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/session-context";
import { Header } from "@/components/Header";
import Image from "next/image";
import { ArrowRight, JourneyPath } from "@/components/art";
import { Button, Notice } from "@/components/ui";

const STEPS = [
  {
    title: "Understand where you are",
    body: "Note what matters most to you, and — if you'd like — add a photo to describe your hair as it is today."
  },
  {
    title: "Explore gently",
    body: "Preview a supported hairstyle on your photo, or read through covering options. Everything is optional, at your pace."
  },
  {
    title: "Rehearse a plan",
    body: "Choose a Plan A, think through a Plan B, and leave with something you can revisit or change whenever you like."
  }
];

export default function WelcomePage() {
  const router = useRouter();
  const { session, ready, create } = useSession();
  // `starting` covers the async session create; `isNavigating` (a transition)
  // stays true until /prepare actually commits. Together they hold the button in
  // one continuous pending state from click to arrival — so it never re-enables
  // and flips to "Continue where I left off" during the ~1s navigation.
  const [starting, setStarting] = useState(false);
  const [isNavigating, startNavigation] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const pending = starting || isNavigating;

  async function begin() {
    setStarting(true);
    setError(null);
    try {
      if (!session) await create();
      // Track navigation as a transition so `isNavigating` stays true until
      // /prepare renders; on success this component unmounts and nothing resets.
      startNavigation(() => router.push("/prepare"));
    } catch {
      setError("We couldn't start a session just now. Please try again.");
    } finally {
      setStarting(false);
    }
  }

  // Steady, honest label: shows "Preparing…" while pending instead of flipping to
  // the resume wording mid-navigation (the source of the confusing button text).
  let ctaLabel = session ? "Continue where I left off" : "Begin preparing";
  if (pending) ctaLabel = "Preparing…";

  return (
    <>
      <Header />
      <main className="shell-wide pb-20">
        {/* ── Hero: asymmetric, editorial ───────────────────────────────── */}
        <section className="grid items-center gap-10 pt-10 sm:pt-14 lg:grid-cols-[1.05fr_0.95fr] lg:gap-14">
          <div className="max-w-xl">
            <p className="flex items-center gap-2.5 text-eyebrow font-semibold uppercase text-periwinkle-deep">
              <span className="h-px w-8 bg-periwinkle/50" aria-hidden />
              Prepare for what&rsquo;s next
            </p>
            <h1 className="mt-5 font-display text-display text-ink">
              A calm space to <em className="not-italic text-periwinkle-deep">imagine</em> the weeks ahead
            </h1>
            <p className="mt-5 text-lead text-body/80">
              LookAhead helps you explore and rehearse appearance choices as you prepare for treatment-related hair
              change. No pressure, no predictions — just a plan that&rsquo;s yours to keep or change.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
              <Button size="lg" onClick={begin} loading={pending} disabled={!ready} className="group">
                {ctaLabel}
                {!pending && (
                  <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
                )}
              </Button>
              <span className="text-sm text-subtle">Takes a few minutes · nothing to sign up for</span>
            </div>

            {error && (
              <div className="mt-5">
                <Notice tone="warn">{error}</Notice>
              </div>
            )}
          </div>

          {/* Composition: the portrait as an editorial plate — an arch frame on a
              soft lavender wash, with the honesty line as an overlapping caption
              card rather than text trapped inside the frame. */}
          <div className="relative mx-auto w-full max-w-sm lg:max-w-none">
            {/* ambient wash behind the plate */}
            <div
              aria-hidden
              className="pointer-events-none absolute -inset-x-8 -inset-y-6 rounded-[2.5rem] bg-[radial-gradient(60%_55%_at_65%_25%,rgba(195,180,232,0.38),transparent_70%),radial-gradient(50%_45%_at_25%_80%,rgba(238,237,251,0.85),transparent_75%)]"
            />
            {/* a thin offset rule — the kind of framing mark you see in print */}
            <div
              aria-hidden
              className="pointer-events-none absolute -right-3 -top-3 hidden h-40 w-40 rounded-t-[999px] border border-periwinkle/25 lg:block"
            />

            <figure className="relative mx-auto max-w-[21.5rem] lg:mr-8 lg:ml-auto">
              <div className="relative overflow-hidden rounded-t-[999px] rounded-b-card border border-hairline bg-surface shadow-soft">
                <div className="relative aspect-[4/5] w-full">
                  <Image
                    src="/images/hero.png"
                    alt="A soft illustrated portrait reflected in a mirror"
                    fill
                    priority
                    sizes="(max-width: 1023px) 24rem, 21.5rem"
                    className="object-cover object-top"
                  />
                </div>
              </div>
              {/* overlapping caption plate */}
              <figcaption className="relative z-10 mx-auto -mt-9 w-[88%] rounded-card border border-hairline bg-surface/95 px-5 py-4 text-center shadow-lift backdrop-blur-sm">
                <p className="text-eyebrow font-semibold uppercase text-periwinkle-deep">Illustration</p>
                <p className="mt-1.5 text-sm leading-relaxed text-subtle">
                  Imagine possibilities — never a prediction of how you will look.
                </p>
              </figcaption>
            </figure>
          </div>
        </section>

        {/* ── Journey rail: a ruled editorial list, not boxed cards ──────── */}
        <section className="mt-16 sm:mt-20">
          <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3 border-b border-hairline pb-4">
            <h2 className="font-display text-display-sm text-ink">How LookAhead works</h2>
            <JourneyPath className="hidden h-12 w-52 text-periwinkle sm:block" activeIndex={-1} aria-hidden />
          </div>
          <ol className="divide-y divide-hairline">
            {STEPS.map((step, i) => (
              <li key={step.title} className="grid gap-2 py-6 sm:grid-cols-[auto_1fr] sm:gap-8 sm:py-7">
                <span className="font-display text-3xl leading-none text-periwinkle-soft tabular-nums sm:text-4xl">
                  0{i + 1}
                </span>
                <div className="max-w-2xl">
                  <h3 className="font-display text-title text-ink">{step.title}</h3>
                  <p className="mt-1.5 leading-relaxed text-body/75">{step.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        {/* ── Honest footnote ───────────────────────────────────────────── */}
        <footer className="mt-12 border-t border-hairline pt-6">
          <p className="max-w-prose text-sm leading-relaxed text-subtle">
            LookAhead offers planning support, not medical advice, and it never predicts how treatment will affect you.
            Your photo and choices are stored privately for this session and can be deleted at any time from the Privacy
            menu.
          </p>
        </footer>
      </main>
    </>
  );
}
