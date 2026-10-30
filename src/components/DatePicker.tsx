"use client";

/**
 * DatePicker — a small, accessible calendar popover (plain React + Tailwind).
 *
 * Replaces the native `<input type="date">` with an on-brand control: a trigger
 * button showing the formatted date (or "Pick a date") plus a calendar glyph,
 * opening a styled popover with a month/year header (prev/next), a weekday row, a
 * day grid, a "today" ring, a selected periwinkle fill, and Today/Clear shortcuts.
 *
 * Keyboard: Escape closes, arrow keys move the focused day, Home/End jump to the
 * month bounds, PageUp/PageDown change month, Enter/Space selects. Click-outside
 * closes. Dates are emitted as LOCAL `yyyy-mm-dd` built from y/m/d parts, so a
 * selection never shifts by a day across timezones.
 */

import { useId, useRef, useState, type FocusEvent, type KeyboardEvent, type ReactNode } from "react";
import { cx } from "@/components/ui";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December"
];

interface DateParts {
  y: number;
  m: number; // 0-11
  d: number;
}

/** Parse an ISO `yyyy-mm-dd` into local parts (no timezone shift). */
function parseISO(iso: string): DateParts | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso ?? "");
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]) - 1;
  const d = Number(match[3]);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null;
  return { y, m, d };
}

/** Build a local ISO `yyyy-mm-dd` from parts (never shifts a day via UTC). */
function toISO(y: number, m: number, d: number): string {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Human label for the trigger, e.g. "15 Jan 2026". */
function formatLong(iso: string): string | null {
  const p = parseISO(iso);
  return p ? `${p.d} ${MONTHS[p.m].slice(0, 3)} ${p.y}` : null;
}

function todayParts(): DateParts {
  const now = new Date();
  return { y: now.getFullYear(), m: now.getMonth(), d: now.getDate() };
}

function daysInMonth(y: number, m: number): number {
  return new Date(y, m + 1, 0).getDate();
}

/** Monday-first grid of day numbers, padded with `null` leading/trailing blanks. */
function monthGrid(y: number, m: number): (number | null)[] {
  const lead = (new Date(y, m, 1).getDay() + 6) % 7; // Mon=0 … Sun=6
  const cells: (number | null)[] = [];
  for (let i = 0; i < lead; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth(y, m); d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

export interface DatePickerProps {
  /** Current value as ISO `yyyy-mm-dd`, or "" when unset. */
  value: string;
  /** Emits ISO `yyyy-mm-dd` on select, or "" on Clear. */
  onChange: (iso: string) => void;
  /** Optional id for the trigger button (form/label association). */
  id?: string;
  /** Optional id of an external element that labels the trigger. */
  labelledBy?: string;
  className?: string;
}

export function DatePicker({ value, onChange, id, labelledBy, className }: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const selected = parseISO(value);
  const today = todayParts();
  const [view, setView] = useState<{ y: number; m: number }>(() => {
    const base = selected ?? today;
    return { y: base.y, m: base.m };
  });
  const [focusDay, setFocusDay] = useState<number>(
    () => selected?.d ?? (view.y === today.y && view.m === today.m ? today.d : 1)
  );

  const rootRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverId = useId();

  const formatted = formatLong(value);
  const cells = monthGrid(view.y, view.m);

  function focusDayButton(d: number) {
    // Wait for the re-render so the target cell exists, then move DOM focus to it.
    requestAnimationFrame(() => {
      gridRef.current?.querySelector<HTMLButtonElement>(`[data-day="${d}"]`)?.focus();
    });
  }

  function openPicker() {
    const base = selected ?? today;
    const nextFocus = selected?.d ?? (base.y === today.y && base.m === today.m ? today.d : 1);
    setView({ y: base.y, m: base.m });
    setFocusDay(nextFocus);
    setOpen(true);
    focusDayButton(nextFocus);
  }

  function closeToTrigger() {
    setOpen(false);
    triggerRef.current?.focus();
  }

  function moveFocus(delta: number) {
    let y = view.y;
    let m = view.m;
    let d = focusDay + delta;
    while (d < 1) {
      m -= 1;
      if (m < 0) {
        m = 11;
        y -= 1;
      }
      d += daysInMonth(y, m);
    }
    let dim = daysInMonth(y, m);
    while (d > dim) {
      d -= dim;
      m += 1;
      if (m > 11) {
        m = 0;
        y += 1;
      }
      dim = daysInMonth(y, m);
    }
    setView({ y, m });
    setFocusDay(d);
    focusDayButton(d);
  }

  function changeMonth(delta: number) {
    let y = view.y;
    let m = view.m + delta;
    while (m < 0) {
      m += 12;
      y -= 1;
    }
    while (m > 11) {
      m -= 12;
      y += 1;
    }
    const dim = daysInMonth(y, m);
    setView({ y, m });
    setFocusDay((fd) => Math.min(fd, dim));
  }

  function commit(iso: string) {
    onChange(iso);
    closeToTrigger();
  }

  function onGridKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    switch (e.key) {
      case "ArrowLeft":
        e.preventDefault();
        moveFocus(-1);
        break;
      case "ArrowRight":
        e.preventDefault();
        moveFocus(1);
        break;
      case "ArrowUp":
        e.preventDefault();
        moveFocus(-7);
        break;
      case "ArrowDown":
        e.preventDefault();
        moveFocus(7);
        break;
      case "Home":
        e.preventDefault();
        setFocusDay(1);
        focusDayButton(1);
        break;
      case "End": {
        e.preventDefault();
        const dim = daysInMonth(view.y, view.m);
        setFocusDay(dim);
        focusDayButton(dim);
        break;
      }
      case "PageUp":
        e.preventDefault();
        changeMonth(-1);
        break;
      case "PageDown":
        e.preventDefault();
        changeMonth(1);
        break;
      case "Escape":
        e.preventDefault();
        closeToTrigger();
        break;
      default:
        break;
    }
  }

  // Click-outside (focus leaves the whole control) closes the popover.
  function onRootBlur(e: FocusEvent<HTMLDivElement>) {
    if (!rootRef.current?.contains(e.relatedTarget as Node)) setOpen(false);
  }

  const isToday = (d: number) => view.y === today.y && view.m === today.m && d === today.d;
  const isSelected = (d: number) => Boolean(selected && view.y === selected.y && view.m === selected.m && d === selected.d);

  return (
    <div ref={rootRef} className={cx("relative", className)} onBlur={onRootBlur}>
      <button
        ref={triggerRef}
        id={id}
        type="button"
        aria-labelledby={labelledBy}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? popoverId : undefined}
        onClick={() => (open ? closeToTrigger() : openPicker())}
        className="field flex items-center justify-between gap-3 text-left"
      >
        <span className={cx("truncate", !formatted && "text-subtle/70")}>{formatted ?? "Pick a date"}</span>
        <CalendarIcon className="h-5 w-5 shrink-0 text-periwinkle-deep" />
      </button>

      {open && (
        <div
          id={popoverId}
          role="dialog"
          aria-modal="false"
          aria-label="Choose a date"
          className="absolute left-0 z-30 mt-2 w-[19rem] rounded-card border border-hairline bg-surface p-3.5 shadow-lift"
        >
          <div className="mb-2.5 flex items-center justify-between gap-2">
            <NavButton onClick={() => changeMonth(-1)} label="Previous month">
              <ChevronIcon className="h-4 w-4" direction="left" />
            </NavButton>
            <p className="font-display text-base text-ink">
              {MONTHS[view.m]} {view.y}
            </p>
            <NavButton onClick={() => changeMonth(1)} label="Next month">
              <ChevronIcon className="h-4 w-4" direction="right" />
            </NavButton>
          </div>

          <div className="grid grid-cols-7 gap-1 text-center" aria-hidden>
            {WEEKDAYS.map((w) => (
              <span key={w} className="py-1 text-[0.7rem] font-semibold uppercase tracking-wide text-subtle">
                {w.slice(0, 2)}
              </span>
            ))}
          </div>

          <div
            ref={gridRef}
            role="group"
            aria-label="Days of the month"
            className="mt-1 grid grid-cols-7 gap-1"
            onKeyDown={onGridKeyDown}
          >
            {cells.map((d, i) =>
              d === null ? (
                <span key={`blank-${i}`} />
              ) : (
                <button
                  key={d}
                  type="button"
                  data-day={d}
                  tabIndex={d === focusDay ? 0 : -1}
                  onClick={() => commit(toISO(view.y, view.m, d))}
                  aria-label={`${d} ${MONTHS[view.m]} ${view.y}`}
                  aria-current={isToday(d) ? "date" : undefined}
                  aria-pressed={isSelected(d)}
                  className={cx(
                    "grid h-9 w-full place-items-center rounded-lg text-sm transition-colors",
                    isSelected(d)
                      ? "bg-periwinkle-deep font-semibold text-white"
                      : isToday(d)
                        ? "border border-periwinkle font-medium text-periwinkle-deep"
                        : "text-body hover:bg-periwinkle-tint",
                    d === focusDay && !isSelected(d) && "ring-2 ring-periwinkle ring-offset-1 ring-offset-surface"
                  )}
                >
                  {d}
                </button>
              )
            )}
          </div>

          <div className="mt-3 flex items-center justify-between gap-2 border-t border-hairline pt-3">
            <button
              type="button"
              onClick={() => commit(toISO(today.y, today.m, today.d))}
              className="rounded text-sm font-medium text-periwinkle-deep underline decoration-periwinkle/40 underline-offset-4 transition-colors hover:decoration-periwinkle-deep"
            >
              Today
            </button>
            {value && (
              <button
                type="button"
                onClick={() => commit("")}
                className="rounded text-sm text-subtle underline decoration-hairline underline-offset-4 transition-colors hover:text-ink"
              >
                Clear
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function NavButton({ onClick, label, children }: { onClick: () => void; label: string; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="grid h-8 w-8 place-items-center rounded-lg border border-hairline text-subtle transition-colors hover:border-periwinkle/50 hover:bg-periwinkle-tint hover:text-periwinkle-deep"
    >
      {children}
    </button>
  );
}

function CalendarIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className={className} aria-hidden>
      <rect x="3" y="4.5" width="18" height="16" rx="2.5" />
      <path d="M3 9.5h18M8 2.5v4M16 2.5v4" strokeLinecap="round" />
    </svg>
  );
}

function ChevronIcon({ className, direction }: { className?: string; direction: "left" | "right" }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className={className} aria-hidden>
      <path
        d={direction === "left" ? "M15 5l-7 7 7 7" : "M9 5l7 7-7 7"}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
