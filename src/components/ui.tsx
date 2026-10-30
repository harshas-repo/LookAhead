"use client";

/**
 * LookAhead design-system primitives (brief §3, §4, §9).
 *
 * A small, calm kit on the editorial ink/periwinkle palette. Every control has
 * default/hover/focus/selected/disabled states, a visible focus ring, and never
 * relies on colour alone to convey meaning. Buttons are refined rectangles rather
 * than pills everywhere, so the important action reads as intentional.
 *
 * NOTE: there is intentionally no provider "mode" badge here. Development-oriented
 * labels (mock/simulated/demo/live) are not shown in the UI; honesty is preserved
 * instead by the illustrated, clearly-captioned previews and real error states.
 */

import type { ButtonHTMLAttributes, ReactNode } from "react";

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

/* ── Button ─────────────────────────────────────────────────────────────── */

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-lavender-deep text-white border-transparent shadow-accent hover:bg-lavender-mid active:translate-y-px",
  secondary:
    "bg-surface text-body border-hairline hover:border-periwinkle/60 hover:bg-periwinkle-tint/60 active:translate-y-px",
  ghost: "bg-transparent text-subtle border-transparent hover:text-ink hover:bg-ink/[0.04]",
  danger: "bg-transparent text-coral border-coral/35 hover:bg-coral/10"
};

const SIZES: Record<Size, string> = {
  sm: "text-sm px-3.5 py-2.5",
  md: "text-[0.95rem] px-5 py-2.5",
  lg: "text-base px-6 py-3.5"
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  full?: boolean;
}

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  full = false,
  className,
  children,
  disabled,
  ...rest
}: ButtonProps) {
  return (
    <button
      className={cx(
        "inline-flex items-center justify-center gap-2 rounded-lg border font-medium transition-all duration-200 ease-editorial",
        "disabled:cursor-not-allowed disabled:opacity-45 disabled:shadow-none disabled:active:translate-y-0",
        VARIANTS[variant],
        SIZES[size],
        full && "w-full",
        className
      )}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading && <Spinner className="h-4 w-4" />}
      {children}
    </button>
  );
}

/* ── Spinner ────────────────────────────────────────────────────────────── */

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      className={cx(
        "inline-block animate-spin rounded-full border-2 border-current border-t-transparent align-[-0.125em]",
        className ?? "h-4 w-4"
      )}
      role="status"
      aria-label="Loading"
    />
  );
}

/* ── Card ───────────────────────────────────────────────────────────────── */

export function Card({
  children,
  className,
  as: As = "div"
}: {
  children: ReactNode;
  className?: string;
  as?: "div" | "section" | "article";
}) {
  return <As className={cx("card p-5 sm:p-7", className)}>{children}</As>;
}

/* ── Section heading ────────────────────────────────────────────────────── */

export function SectionHeading({
  eyebrow,
  title,
  description,
  className
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  className?: string;
}) {
  return (
    <div className={cx("space-y-2", className)}>
      {eyebrow && (
        <p className="flex items-center gap-2.5 text-eyebrow font-semibold uppercase text-periwinkle-deep">
          <span className="h-px w-6 bg-periwinkle/50" aria-hidden />
          {eyebrow}
        </p>
      )}
      <h2 className="font-display text-display-sm text-ink">{title}</h2>
      {description && <p className="max-w-prose text-[1rem] leading-relaxed text-body/75">{description}</p>}
    </div>
  );
}

/* ── Badge ──────────────────────────────────────────────────────────────── */

export function Badge({
  children,
  tone = "neutral",
  className,
  title
}: {
  children: ReactNode;
  tone?: "neutral" | "sage" | "teal" | "lavender" | "warn";
  className?: string;
  title?: string;
}) {
  const tones: Record<string, string> = {
    neutral: "bg-paper text-subtle border-hairline",
    // Legacy tone names are kept so existing callers don't churn; they now map
    // onto the editorial palette. Selected/confirmed states also carry a mark.
    sage: "bg-periwinkle-tint text-periwinkle-deep border-periwinkle/35",
    teal: "bg-periwinkle-tint/70 text-ink border-periwinkle-soft",
    lavender: "bg-lavender/70 text-ink border-lavender",
    warn: "bg-coral/10 text-[#a4482f] border-coral/30"
  };
  return (
    <span
      title={title}
      className={cx(
        "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium",
        tones[tone],
        className
      )}
    >
      {children}
    </span>
  );
}

/* ── Notice ─────────────────────────────────────────────────────────────── */

export function Notice({
  tone = "info",
  title,
  children,
  className
}: {
  tone?: "info" | "warn" | "success";
  title?: string;
  children: ReactNode;
  className?: string;
}) {
  const tones: Record<string, string> = {
    info: "border-periwinkle/25 bg-periwinkle-tint/60",
    warn: "border-coral/30 bg-coral/[0.08]",
    success: "border-periwinkle-soft/60 bg-periwinkle-tint/50"
  };
  return (
    <div
      className={cx("rounded-card border p-4 text-sm leading-relaxed", tones[tone], className)}
      role="status"
    >
      {title && <p className="mb-1 font-medium text-ink">{title}</p>}
      <div className="text-body/85">{children}</div>
    </div>
  );
}

/* ── Progress bar ───────────────────────────────────────────────────────── */

export function ProgressBar({ value, max, label }: { value: number; max: number; label?: string }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div className="space-y-1.5">
      {label && (
        <div className="flex items-center justify-between text-xs text-subtle">
          <span>{label}</span>
          <span className="tabular-nums">
            {value} of {max}
          </span>
        </div>
      )}
      <div
        className="h-1.5 w-full overflow-hidden rounded-full bg-ink/[0.07]"
        role="progressbar"
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={max}
      >
        <div
          className="h-full rounded-full bg-periwinkle-deep transition-all duration-500 ease-editorial"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
