/**
 * LookAhead illustration system (brief §5).
 *
 * A small, consistent set of custom inline SVGs — fine editorial linework that
 * tells the product's story (reflection, hair, a journey through decisions) rather
 * than decorative filler. Everything is:
 *   • lightweight and scalable (simple, coherent paths — no dense generated art),
 *   • colour-agnostic (strokes use `currentColor`, so a wrapper's text colour
 *     themes the artwork),
 *   • accessible (decorative art is `aria-hidden`; meaningful art exposes a title).
 *
 * Motifs are reused across screens but recomposed for context, so no page repeats
 * the exact same graphic (brief §5, §7).
 */

import type { ReactElement, SVGProps } from "react";

type ArtProps = SVGProps<SVGSVGElement> & { title?: string };

/* Shared line style — keeps every motif on one visual grammar. */
const LINE = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round",
  strokeLinejoin: "round"
} as const;

/* ── Brand mark ─────────────────────────────────────────────────────────── */

/**
 * An abstract mirror reflecting a strand of hair — "look ahead" at a possible
 * self. Used in the header and as a favicon-like glyph.
 */
export function Logo({ className, ...rest }: ArtProps) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true" focusable="false" {...rest}>
      <ellipse cx="16" cy="16" rx="10.5" ry="13" {...LINE} strokeWidth={1.6} />
      <path d="M11 8.5c3.4 2.2 3.4 12.8 0 15" {...LINE} />
      <path d="M16 6.5c2.6 3 2.6 16 0 19" {...LINE} opacity={0.55} />
      <circle cx="21" cy="13" r="1.5" fill="currentColor" stroke="none" />
    </svg>
  );
}

/* ── Decorative compositions ────────────────────────────────────────────── */

/**
 * Flowing hair strands as elegant linework. Purely decorative — pair with a
 * heading or panel edge. Scales to its container.
 */
export function HairStrands({ className, ...rest }: ArtProps) {
  return (
    <svg viewBox="0 0 240 160" className={className} aria-hidden="true" focusable="false" {...rest}>
      <g {...LINE} strokeWidth={1.25}>
        <path d="M10 150C40 110 30 60 70 20" opacity={0.9} />
        <path d="M40 152C74 116 60 62 104 22" opacity={0.7} />
        <path d="M74 154C110 120 96 66 140 26" opacity={0.5} />
        <path d="M110 156C146 124 132 70 176 30" opacity={0.34} />
        <path d="M148 158C182 128 170 78 210 40" opacity={0.22} />
      </g>
    </svg>
  );
}

/**
 * Hero composition: an abstract portrait reflected in a mirror, with a curved
 * strand. Meaningful on the welcome screen, so it exposes a title.
 */
export function MirrorPortrait({ className, title, ...rest }: ArtProps) {
  return (
    <svg
      viewBox="0 0 320 360"
      className={className}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      focusable="false"
      {...rest}
    >
      {title && <title>{title}</title>}
      <defs>
        <linearGradient id="la-mirror" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.14" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0.02" />
        </linearGradient>
      </defs>
      {/* mirror frame */}
      <path d="M160 20c62 0 104 46 104 116v120H56V136C56 66 98 20 160 20Z" {...LINE} strokeWidth={1.5} />
      <path d="M160 34c54 0 90 40 90 104v118H70V138C70 74 106 34 160 34Z" fill="url(#la-mirror)" stroke="none" />
      {/* reflected portrait */}
      <g {...LINE} strokeWidth={1.6}>
        <circle cx="160" cy="150" r="42" />
        <path d="M96 268c6-40 32-62 64-62s58 22 64 62" />
      </g>
      {/* a strand falling across the reflection */}
      <path d="M124 118c22 16 22 70 4 96" {...LINE} strokeWidth={1.3} opacity={0.7} />
      <path d="M196 118c-18 20-16 62 0 84" {...LINE} strokeWidth={1.3} opacity={0.45} />
      {/* stand */}
      <path d="M160 256v40M128 300h64" {...LINE} strokeWidth={1.5} opacity={0.5} />
    </svg>
  );
}

/**
 * A curved decision journey with nodes — reinforces "a path through choices".
 * `activeIndex` (0-based) fills nodes up to and including that step, so the same
 * motif doubles as an honest progress indicator without relying on colour alone.
 */
export function JourneyPath({
  className,
  activeIndex = -1,
  steps = 4,
  ...rest
}: ArtProps & { activeIndex?: number; steps?: number }) {
  const nodes = Array.from({ length: steps }, (_, i) => i / (steps - 1 || 1));
  return (
    <svg viewBox="0 0 320 90" className={className} aria-hidden="true" focusable="false" {...rest}>
      <path d="M14 66C70 66 70 24 128 24s58 42 114 42 52-30 64-34" {...LINE} strokeWidth={1.4} opacity={0.5} />
      {nodes.map((t, i) => {
        // Approximate positions along the curve for even node spacing.
        const x = 14 + t * 292;
        const y = 66 - Math.sin(t * Math.PI) * 40;
        const done = i <= activeIndex;
        return (
          <g key={i}>
            <circle
              cx={x}
              cy={y}
              r={done ? 7 : 6}
              fill={done ? "currentColor" : "none"}
              stroke="currentColor"
              strokeWidth={1.5}
              opacity={done ? 1 : 0.5}
            />
          </g>
        );
      })}
    </svg>
  );
}

/* ── Priority glyphs (24px, map 1:1 to Priority enum) ───────────────────── */

export type PriorityKey = "familiar_appearance" | "comfort" | "privacy" | "cost" | "control_timing";

const PRIORITY_ART: Record<PriorityKey, ReactElement> = {
  // A portrait bust — "looking like myself".
  familiar_appearance: (
    <g {...LINE}>
      <circle cx="12" cy="8.5" r="3.75" />
      <path d="M4.75 20c.9-3.9 3.9-6 7.25-6s6.35 2.1 7.25 6" />
    </g>
  ),
  // A soft cushion / gentle wave — physical comfort.
  comfort: (
    <g {...LINE}>
      <path d="M4 13c0-3.3 3.6-6 8-6s8 2.7 8 6-3.6 6-8 6-8-2.7-8-6Z" />
      <path d="M8 13c1.3-1.4 2.7-1.4 4 0s2.7 1.4 4 0" />
    </g>
  ),
  // A shield — privacy, choosing what others notice.
  privacy: (
    <g {...LINE}>
      <path d="M12 3.5 19 6v6c0 4-3 7-7 8.5C8 19 5 16 5 12V6l7-2.5Z" />
      <path d="M9.5 12.2c1.6-1.6 3.4-1.6 5 0" opacity={0.7} />
    </g>
  ),
  // A coin — cost, staying within budget.
  cost: (
    <g {...LINE}>
      <circle cx="12" cy="12" r="8.25" />
      <path d="M12 7.5v9M14.2 9.4c-.6-.7-1.4-1-2.3-1-1.2 0-2.1.7-2.1 1.7 0 2.4 4.5 1.2 4.5 3.6 0 1-1 1.8-2.3 1.8-1 0-1.8-.3-2.4-1" />
    </g>
  ),
  // A clock — control & timing, on your own terms.
  control_timing: (
    <g {...LINE}>
      <circle cx="12" cy="12" r="8.25" />
      <path d="M12 7.75V12l3 1.75" />
    </g>
  )
};

export function PriorityGlyph({ priority, className, ...rest }: ArtProps & { priority: PriorityKey }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" focusable="false" {...rest}>
      {PRIORITY_ART[priority] ?? PRIORITY_ART.comfort}
    </svg>
  );
}

/* ── Option illustrations (for looks the VTO can't render) ──────────────── */

export type OptionArtKey = "wig" | "scarf" | "hat" | "no_covering" | "keep_current" | "hairstyle";

/**
 * Honest, hand-drawn illustrations for covering / no-covering options. The
 * hairstyle VTO restyles existing hair and cannot render these, so we describe
 * them with a consistent motif + text rather than implying a photo preview.
 */
const OPTION_ART: Record<OptionArtKey, ReactElement> = {
  // A wig on a stand: hair volume over a bare form.
  wig: (
    <g {...LINE} strokeWidth={1.4}>
      <path d="M20 46c0-16 8-26 20-26s20 10 20 26" />
      <path d="M24 46c2-10 6-16 10-18M56 46c-2-10-6-16-10-18" opacity={0.6} />
      <circle cx="40" cy="52" r="9" />
      <path d="M28 74c2-8 6-11 12-11s10 3 12 11" />
    </g>
  ),
  // A wrapped scarf with a knot.
  scarf: (
    <g {...LINE} strokeWidth={1.4}>
      <path d="M18 44c4-16 12-24 22-24s18 8 22 24c-6 4-14 6-22 6s-16-2-22-6Z" />
      <path d="M34 50c-2 10-6 16-12 20M46 50c2 10 6 16 12 20" opacity={0.7} />
      <circle cx="40" cy="46" r="4" />
    </g>
  ),
  // A beanie / hat silhouette.
  hat: (
    <g {...LINE} strokeWidth={1.4}>
      <path d="M20 52c0-14 9-24 20-24s20 10 20 24" />
      <rect x="16" y="52" width="48" height="10" rx="5" />
      <path d="M40 28v-6" opacity={0.6} />
    </g>
  ),
  // A bare portrait with a soft shine — choosing not to cover.
  no_covering: (
    <g {...LINE} strokeWidth={1.4}>
      <circle cx="40" cy="38" r="18" />
      <path d="M14 78c4-16 14-24 26-24s22 8 26 24" />
      <path d="M30 30c3-4 7-6 11-6" opacity={0.6} />
    </g>
  ),
  // Flowing strands — keeping a look close to current.
  keep_current: (
    <g {...LINE} strokeWidth={1.4}>
      <circle cx="40" cy="36" r="16" />
      <path d="M24 40c-2 16 0 28 4 36M56 40c2 16 0 28-4 36" />
      <path d="M32 22c4 8 4 20 2 30M48 22c-4 8-4 20-2 30" opacity={0.55} />
    </g>
  ),
  // Generic hairstyle motif (visualizable options fall back to this if needed).
  hairstyle: (
    <g {...LINE} strokeWidth={1.4}>
      <circle cx="40" cy="38" r="17" />
      <path d="M23 34c4-12 12-16 17-16s13 4 17 16" />
      <path d="M26 44c-3 14-2 24 1 32M54 44c3 14 2 24-1 32" opacity={0.6} />
    </g>
  )
};

/**
 * A framed illustration tile for an appearance option. `artKey` selects the motif
 * from the option's identity; the wrapper's text colour themes the linework.
 */
export function OptionArt({
  artKey,
  label,
  className,
  ...rest
}: ArtProps & { artKey: OptionArtKey; label?: string }) {
  return (
    <svg
      viewBox="0 0 80 88"
      className={className}
      role={label ? "img" : undefined}
      aria-hidden={label ? undefined : true}
      aria-label={label}
      focusable="false"
      {...rest}
    >
      {label && <title>{label}</title>}
      {OPTION_ART[artKey] ?? OPTION_ART.hairstyle}
    </svg>
  );
}

/** Map a curated option id → its illustration motif. */
export function optionArtKey(optionId: string): OptionArtKey {
  if (optionId === "wig") return "wig";
  if (optionId === "scarf") return "scarf";
  if (optionId === "hat") return "hat";
  if (optionId === "no_covering") return "no_covering";
  if (optionId === "keep_current") return "keep_current";
  return "hairstyle";
}

/* ── Small functional marks ─────────────────────────────────────────────── */

/** A fine check mark (used with text, never as the only signal). */
export function CheckMark({ className, ...rest }: ArtProps) {
  return (
    <svg viewBox="0 0 16 16" className={className} aria-hidden="true" focusable="false" {...rest}>
      <path d="M3 8.5 6.5 12 13 4.5" {...LINE} strokeWidth={1.8} />
    </svg>
  );
}

/** A gentle right-arrow for "continue" affordances. */
export function ArrowRight({ className, ...rest }: ArtProps) {
  return (
    <svg viewBox="0 0 20 20" className={className} aria-hidden="true" focusable="false" {...rest}>
      <path d="M4 10h11M11 5.5 15.5 10 11 14.5" {...LINE} strokeWidth={1.5} />
    </svg>
  );
}
