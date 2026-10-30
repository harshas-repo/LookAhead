"use client";

/**
 * PriorityPicker — "Understand Me" step (solution.md).
 *
 * The user marks what matters most. These priorities only re-order the options we
 * show later (rule-based, transparent); they never remove choices or force a
 * decision. Everything is optional and editable. Each priority carries a small
 * line glyph, and a selected state uses a check + border + weight — not colour
 * alone (brief §4, §8).
 */

import { useState } from "react";
import { api } from "@/lib/api-client";
import { useSession } from "@/lib/session-context";
import { PRIORITY_LABELS } from "@/lib/labels";
import { PRIORITIES, type Priority } from "@/lib/types";
import { CheckMark, PriorityGlyph } from "@/components/art";
import { DatePicker } from "@/components/DatePicker";
import { Button, Card, Notice, SectionHeading, cx } from "@/components/ui";

export function PriorityPicker() {
  const { id, token, session, setSession } = useSession();
  const [selected, setSelected] = useState<Priority[]>(session?.profile.priorities ?? []);
  const [top, setTop] = useState<Priority[]>(session?.profile.topPriorities ?? []);
  const [date, setDate] = useState<string>(session?.profile.optionalTreatmentDate ?? "");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggle(list: Priority[], setList: (v: Priority[]) => void, value: Priority, max = 99) {
    if (list.includes(value)) setList(list.filter((v) => v !== value));
    else if (list.length < max) setList([...list, value]);
  }

  async function save() {
    if (!id || !token) return;
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const { session: updated } = await api.updateProfile(id, token, {
        priorities: selected,
        topPriorities: top,
        optionalTreatmentDate: date || null,
        currentStage: selected.length > 0 ? "PROFILE" : undefined
      });
      setSession(updated);
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save that.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="space-y-7">
      <SectionHeading
        eyebrow="Step 1"
        title="What matters most to you right now?"
        description="Pick any that resonate. There are no wrong answers, and you can change these later."
      />

      <div className="grid gap-3 sm:grid-cols-2">
        {PRIORITIES.map((p) => {
          const active = selected.includes(p);
          return (
            <button
              key={p}
              type="button"
              aria-pressed={active}
              onClick={() => toggle(selected, setSelected, p)}
              className={cx(
                "group flex items-start gap-3.5 rounded-card border p-4 text-left transition-all duration-200 ease-editorial",
                active
                  ? "border-periwinkle-deep bg-periwinkle-tint shadow-accent"
                  : "border-hairline bg-surface hover:border-periwinkle/50 hover:bg-periwinkle-tint/40"
              )}
            >
              <span
                className={cx(
                  "mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-lg border transition-colors",
                  active ? "border-periwinkle-deep/30 bg-surface text-periwinkle-deep" : "border-hairline bg-paper text-subtle"
                )}
                aria-hidden
              >
                <PriorityGlyph priority={p} className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center justify-between gap-2">
                  <span className={cx("font-medium text-ink", active && "text-periwinkle-deep")}>
                    {PRIORITY_LABELS[p].label}
                  </span>
                  <span
                    className={cx(
                      "grid h-5 w-5 shrink-0 place-items-center rounded-full border transition-colors",
                      active ? "border-periwinkle-deep bg-periwinkle-deep text-white" : "border-hairline text-transparent"
                    )}
                    aria-hidden
                  >
                    <CheckMark className="h-3.5 w-3.5" />
                  </span>
                </span>
                <span className="mt-1 block text-sm leading-relaxed text-subtle">{PRIORITY_LABELS[p].hint}</span>
              </span>
            </button>
          );
        })}
      </div>

      {selected.length > 1 && (
        <div className="space-y-2.5 border-t border-hairline pt-5">
          <p className="label">If you had to name one or two, which stand out?</p>
          <div className="flex flex-wrap gap-2">
            {selected.map((p) => {
              const active = top.includes(p);
              return (
                <button
                  key={p}
                  type="button"
                  aria-pressed={active}
                  onClick={() => toggle(top, setTop, p, 2)}
                  className={cx(
                    "inline-flex items-center gap-1.5 rounded-lg border px-3.5 py-1.5 text-sm transition-colors",
                    active
                      ? "border-ink bg-ink text-paper"
                      : "border-hairline bg-surface text-subtle hover:border-ink/40 hover:text-ink"
                  )}
                >
                  {active && <CheckMark className="h-3.5 w-3.5" aria-hidden />}
                  {PRIORITY_LABELS[p].label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="space-y-2 border-t border-hairline pt-5">
        <span className="label block" id="treatment-date-label">
          Roughly when does treatment start? (optional)
        </span>
        <DatePicker
          id="treatment-date"
          labelledBy="treatment-date-label"
          value={date}
          onChange={setDate}
          className="sm:max-w-xs"
        />
        <p className="text-xs text-subtle">
          Only if it&rsquo;s helpful for your planning. We never use this to predict anything.
        </p>
      </div>

      <div className="flex items-center gap-3">
        <Button onClick={save} loading={busy} disabled={selected.length === 0}>
          Save my priorities
        </Button>
        {saved && (
          <span className="inline-flex items-center gap-1.5 text-sm text-periwinkle-deep">
            <CheckMark className="h-4 w-4" aria-hidden /> Saved
          </span>
        )}
      </div>
      {error && <Notice tone="warn">{error}</Notice>}
    </Card>
  );
}
