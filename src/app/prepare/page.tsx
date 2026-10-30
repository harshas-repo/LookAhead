"use client";

/**
 * Prepare (`/prepare`) — onboarding: priorities, photo, hair record, preparation.
 *
 * Step 2 (photos) builds the hair record and is part of the core flow; Step 4 is
 * purely informational. The layout reads top-to-bottom as a calm progression, with
 * the "prepare early" ideas presented as an editorial list rather than a row of
 * identical cards.
 */

import { useRouter } from "next/navigation";
import { useSession } from "@/lib/session-context";
import { Header } from "@/components/Header";
import { SessionGate } from "@/components/SessionGate";
import { PriorityPicker } from "@/components/PriorityPicker";
import { PhotoCapture } from "@/components/PhotoCapture";
import { HairRecordCard } from "@/components/HairRecordCard";
import { ArrowRight } from "@/components/art";
import { Button, SectionHeading } from "@/components/ui";

const PREP_ITEMS = [
  {
    title: "Gather a reference photo",
    body: "A clear, front-facing photo in even light helps previews look closer to you. You can replace it anytime."
  },
  {
    title: "Note what feels like ‘you’",
    body: "Think about the styles, colours, and lengths you're drawn to. Familiarity is a valid priority."
  },
  {
    title: "Consider options early",
    body: "Wigs, wraps, and hats can take time to arrange or adjust. Exploring now, while you have time, keeps choices open."
  },
  {
    title: "Keep questions for your care team",
    body: "Anything you're unsure about — timing, scalp care, what to expect — we'll collect it into your plan."
  }
];

export default function PreparePage() {
  return (
    <SessionGate>
      <PrepareContent />
    </SessionGate>
  );
}

function PrepareContent() {
  const router = useRouter();
  const { session } = useSession();
  const canContinue = (session?.profile.priorities.length ?? 0) > 0;

  return (
    <>
      <Header />
      <main className="shell-mid space-y-8 pb-28 pt-10 sm:pt-14">
        <SectionHeading
          eyebrow="Prepare"
          title="Let's start where you are"
          description="A few gentle steps to understand what matters to you and describe your hair today. Your priorities and your photos build the record, and you can change it all later."
        />

        <PriorityPicker />

        <div className="space-y-4">
          <SectionHeading
            eyebrow="Step 2"
            title="Add a photo of how you look today"
            description="Used only to describe your hair and render previews. Add the four angles with your camera or by upload — both go through the same private pipeline."
          />
          <PhotoCapture />
        </div>

        <HairRecordCard />

        <section className="space-y-4">
          <SectionHeading
            eyebrow="Step 4 · no action needed"
            title="Things that are easier to prepare early"
            description="Just a few ideas to keep in mind as you explore."
          />
          <ul className="divide-y divide-hairline overflow-hidden rounded-card border border-hairline bg-surface">
            {PREP_ITEMS.map((item, i) => (
              <li key={item.title} className="grid gap-1 p-5 sm:grid-cols-[auto_1fr] sm:gap-5 sm:p-6">
                <span className="font-display text-lg leading-none text-periwinkle-soft tabular-nums">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div>
                  <p className="font-medium text-ink">{item.title}</p>
                  <p className="mt-1 text-sm leading-relaxed text-body/75">{item.body}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <div className="no-print sticky bottom-4 z-20 flex justify-end">
          <div className="card flex items-center gap-3 px-4 py-3 shadow-lift">
            {!canContinue && <span className="text-sm text-subtle">Add at least one priority to continue</span>}
            <Button size="lg" disabled={!canContinue} onClick={() => router.push("/rehearse")} className="group">
              Continue to explore
              <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
            </Button>
          </div>
        </div>
      </main>
    </>
  );
}
