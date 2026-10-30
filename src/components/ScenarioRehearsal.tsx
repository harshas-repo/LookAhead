"use client";

/**
 * ScenarioRehearsal — gently stress-tests Plan A (instruction §7C).
 *
 * Presents one practical "what if" scenario chosen deterministically from Plan A,
 * with a small set of alternatives plus an explicit "leave undecided" path. The
 * answer is stored as a decision; leaving it unresolved is a valid, honest outcome
 * that the final plan reports rather than hides.
 */

import { useState } from "react";
import { api, type ScenarioResponse } from "@/lib/api-client";
import { useSession } from "@/lib/session-context";
import { Badge, Card, Notice, SectionHeading, cx } from "@/components/ui";

const UNDECIDED = "Leave this undecided for now";

export function ScenarioRehearsal({ scenario, enabled }: { scenario: ScenarioResponse | null; enabled: boolean }) {
  const { id, token, session, refresh } = useSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const decision = session?.decisions.find((d) => d.questionId === scenario?.decisionQuestionId) ?? null;

  async function choose(choice: string) {
    if (!id || !token || !scenario) return;
    setBusy(true);
    setError(null);
    try {
      await api.recordDecision(id, token, {
        questionId: scenario.decisionQuestionId,
        prompt: scenario.question,
        selectedOption: choice === UNDECIDED ? null : choice,
        isResolved: choice !== UNDECIDED
      });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save that.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="space-y-5">
      <SectionHeading
        eyebrow="Rehearse"
        title="Imagine a day that doesn&apos;t go to plan"
        description="Thinking this through now means you already have a fallback in mind — no decision required today."
      />

      {!enabled && (
        <Notice tone="info">Choose a Plan A first, and we&apos;ll suggest a scenario that fits it.</Notice>
      )}

      {enabled && !scenario && <p className="muted text-sm">Loading your scenario…</p>}

      {enabled && scenario && (
        <div className="space-y-4">
          <p className="rounded-r-card border-l-2 border-periwinkle-soft bg-lavender/40 py-4 pl-5 pr-4 text-[1.02rem] italic leading-relaxed text-body/90">
            {scenario.situation}
          </p>
          <p className="font-display text-title text-ink">{scenario.question}</p>

          <div className="flex flex-wrap gap-2">
            {scenario.choices.map((choice) => {
              const isUndecided = choice === UNDECIDED;
              const active = isUndecided
                ? decision !== null && !decision.isResolved
                : decision?.selectedOption === choice;
              return (
                <button
                  key={choice}
                  type="button"
                  disabled={busy}
                  aria-pressed={active}
                  onClick={() => choose(choice)}
                  className={cx("chip", isUndecided && "border-dashed")}
                >
                  {choice}
                </button>
              );
            })}
          </div>

          {decision && (
            <div className="flex items-center gap-2">
              {decision.isResolved ? (
                <Badge tone="sage">Noted: {decision.selectedOption}</Badge>
              ) : (
                <Badge tone="neutral">Left undecided — that&apos;s completely fine</Badge>
              )}
            </div>
          )}
        </div>
      )}

      {error && <Notice tone="warn">{error}</Notice>}
    </Card>
  );
}
