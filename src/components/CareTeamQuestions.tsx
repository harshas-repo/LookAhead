"use client";

/**
 * CareTeamQuestions — collect things to ask a professional.
 *
 * LookAhead never answers medical questions; instead it helps the user write down
 * what they want to raise with their care team, and includes those in the plan.
 */

import { useState } from "react";
import { api } from "@/lib/api-client";
import type { PlanSummary } from "@/lib/decision/engine";
import { useSession } from "@/lib/session-context";
import { Button, Card, Notice, SectionHeading } from "@/components/ui";

const SUGGESTIONS = [
  "When is a good time to arrange a wig, if I want one?",
  "How can I care for my scalp as my hair changes?",
  "What should I expect, and when?",
  "Are there options covered by insurance or support services?"
];

export function CareTeamQuestions({ onSaved }: { onSaved?: (plan: PlanSummary) => void }) {
  const { id, token, session, setSession } = useSession();
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Optimistic list: the moment a question is added or removed it shows here (and
  // in the plan summary via `onSaved`) — the server round-trip only confirms it.
  const [optimistic, setOptimistic] = useState<string[] | null>(null);

  const stored = session?.plan.questionsForCareTeam ?? [];
  const questions = optimistic ?? stored;

  async function save(next: string[]) {
    if (!id || !token) return;
    setBusy(true);
    setError(null);
    try {
      const { plan, session: updated } = await api.updatePlan(id, token, { questionsForCareTeam: next.slice(0, 20) });
      setSession(updated);
      setOptimistic(null); // fall back to the freshly-saved server state
      onSaved?.(plan);
    } catch (err) {
      setOptimistic(null); // roll back so the list never lies about what's saved
      setError(err instanceof Error ? err.message : "Could not save that.");
    } finally {
      setBusy(false);
    }
  }

  function add(text: string) {
    const value = text.trim();
    if (!value || questions.includes(value)) return;
    setDraft("");
    const next = [...questions, value];
    setOptimistic(next);
    void save(next);
  }

  function remove(text: string) {
    const next = questions.filter((q) => q !== text);
    setOptimistic(next);
    void save(next);
  }

  return (
    <Card className="space-y-5">
      <SectionHeading
        eyebrow="For your care team"
        title="Questions to bring to a professional"
        description="We won't answer medical questions here — but we'll keep them tidy so you can ask the right person."
      />

      <div className="flex gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add(draft);
            }
          }}
          placeholder="Write a question…"
          aria-label="Add a question for your care team"
          className="field min-w-0 flex-1"
        />
        <Button className="shrink-0" onClick={() => add(draft)} disabled={busy || !draft.trim()}>
          Add
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        {SUGGESTIONS.filter((s) => !questions.includes(s)).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => add(s)}
            disabled={busy}
            className="rounded-lg border border-dashed border-hairline bg-periwinkle-tint/40 px-3.5 py-2 text-xs text-subtle transition-colors hover:border-periwinkle/60 hover:text-ink"
          >
            + {s}
          </button>
        ))}
      </div>

      {questions.length > 0 && (
        <ul className="space-y-2">
          {questions.map((q) => (
            <li key={q} className="flex items-start justify-between gap-3 rounded-card border border-hairline bg-surface p-3">
              <span className="text-sm text-body">{q}</span>
              <button
                type="button"
                onClick={() => remove(q)}
                className="shrink-0 rounded px-1.5 py-1 text-xs text-subtle underline underline-offset-2 transition-colors hover:text-coral"
                aria-label={`Remove: ${q}`}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      {error && <Notice tone="warn">{error}</Notice>}
    </Card>
  );
}
