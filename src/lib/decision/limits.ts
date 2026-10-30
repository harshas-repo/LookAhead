/**
 * Server-enforced preview limits and reuse rules (instruction §6).
 *
 * Kept as pure functions so the invariants — a hard per-session budget, reuse of
 * an identical successful preview instead of re-charging, and no automatic retry
 * of failures — can be unit-tested without HTTP or a provider.
 */

import type { Preview, Session, TryOnFamily } from "../types";

export interface BudgetCheck {
  allowed: boolean;
  used: number;
  max: number;
  reason?: "limit_reached";
}

/**
 * Whether a NEW preview attempt is allowed under the session budget.
 * `max <= 0` means unlimited (the default): every attempt is allowed. A positive
 * max re-imposes a hard ceiling as a live cost-control escape hatch.
 */
export function checkPreviewBudget(used: number, max: number): BudgetCheck {
  if (max <= 0) return { allowed: true, used, max };
  if (used >= max) return { allowed: false, used, max, reason: "limit_reached" };
  return { allowed: true, used, max };
}

/**
 * A prior successful preview for the same template + family + photo can be reused
 * rather than regenerated (and re-charged). Family is part of the key so identical
 * template ids across families never collide. Failures are NOT reused — but they are
 * also never auto-retried; a retry only happens on explicit user action.
 */
export function findReusablePreview(
  session: Session,
  templateId: string,
  photoRefId: string,
  family: TryOnFamily
): Preview | null {
  return (
    session.previews.find(
      (p) =>
        p.templateId === templateId &&
        p.family === family &&
        p.inputPhotoRefId === photoRefId &&
        p.status === "success"
    ) ?? null
  );
}

/**
 * A preview for the same template + photo that is still being generated.
 *
 * Used to BLOCK duplicate submissions while a task is in flight (api-feasibility.md
 * §5): a second click, a second tab, or a client retry must not create — and charge
 * for — a second identical task. The route returns the in-flight preview with
 * `reused: true` and does NOT touch the budget.
 *
 * Kept separate from `findReusablePreview` (success-only) so the two invariants stay
 * independently testable: a still-processing preview is never treated as a reusable
 * *result*, only as an in-flight guard.
 */
export function findInFlightPreview(
  session: Session,
  templateId: string,
  photoRefId: string,
  family: TryOnFamily
): Preview | null {
  return (
    session.previews.find(
      (p) =>
        p.templateId === templateId &&
        p.family === family &&
        p.inputPhotoRefId === photoRefId &&
        p.status === "processing"
    ) ?? null
  );
}

/**
 * Remaining previews the user can still generate. `max <= 0` means unlimited and
 * reports `Number.POSITIVE_INFINITY`, which keeps every `remaining > 0` /
 * `Math.min` consumer on the "budget available" branch without special-casing.
 */
export function remainingPreviews(session: Session, max: number): number {
  if (max <= 0) return Number.POSITIVE_INFINITY;
  return Math.max(0, max - session.previewBudgetUsed);
}
