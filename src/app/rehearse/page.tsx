"use client";

/**
 * Rehearse (`/rehearse`) — exploration.
 *
 * A wide, image-led surface: the user previews supported hairstyles on their photo
 * and reads the options that can't be rendered (wigs, wraps, hats, no covering).
 * Choosing a Plan A carries them into the Plan screen, where scenarios and Plan B
 * are rehearsed. Back/forward navigation is always available so nothing feels
 * locked in.
 */

import { useRouter } from "next/navigation";
import { Header } from "@/components/Header";
import { SessionGate } from "@/components/SessionGate";
import { ExploreOptions } from "@/components/ExploreOptions";
import { ArrowRight } from "@/components/art";
import { Button, SectionHeading } from "@/components/ui";

export default function RehearsePage() {
  return (
    <SessionGate>
      <RehearseContent />
    </SessionGate>
  );
}

function RehearseContent() {
  const router = useRouter();

  return (
    <>
      <Header />
      <main className="shell-wide space-y-8 pb-24 pt-10 sm:pt-14">
        <div className="grid gap-6 lg:grid-cols-[1fr_auto] lg:items-end">
          <SectionHeading
            eyebrow="Rehearse"
            title="Explore what could feel like you"
            description="Preview a hairstyle on your photo, or read through the options that can't be shown as a preview. There's no right answer — pick whatever helps you imagine the weeks ahead."
          />
        </div>

        <ExploreOptions onChosenPlanA={() => router.push("/plan")} />

        <div className="flex items-center justify-between gap-4 border-t border-hairline pt-6">
          <button
            type="button"
            onClick={() => router.push("/prepare")}
            className="rounded-lg px-3 py-2 text-sm text-subtle transition-colors hover:bg-ink/[0.04] hover:text-ink"
          >
            ← Back to prepare
          </button>
          <Button size="lg" onClick={() => router.push("/plan")} className="group">
            Go to my plan
            <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
          </Button>
        </div>
      </main>
    </>
  );
}
