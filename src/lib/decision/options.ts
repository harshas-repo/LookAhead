/**
 * Appearance option catalog.
 *
 * Builds the curated set of options the user can explore from the combined provider
 * catalog. EVERY option is visualizable now: the four try-on families (hairstyle,
 * extension, bangs, volume) all render a preview, so the old text-only covering
 * options (scarf / hat / no-covering / keep-current) are gone. Template IDs always
 * come from the provider list — never invented.
 *
 * Extensions are positioned as the "wig" role and categorised as `covering`, so the
 * existing comfort/privacy priority scoring still lifts them without extra rules.
 */

import { TRY_ON_FAMILIES } from "../types";
import type { AppearanceOption, Priority, TryOnFamily } from "../types";
import type { VtoTemplate } from "../providers/types";
import type { Recommendation } from "./recommend";

/**
 * Per-family caps: how many catalog thumbnails to surface for each family. Browsing
 * thumbnails is free; the generated-preview budget (4, shared across families) is
 * enforced separately in limits.ts, so surfacing more here costs nothing.
 *
 * Hairstyle surfaces EVERY female look the catalog returns (the provider fetch is
 * capped at page_size=20, and male templates are filtered out), because this is a
 * female-targeted app and users want to browse the full range. The other families
 * stay small and curated.
 */
const FAMILY_CAPS: Record<TryOnFamily, number> = {
  hairstyle: 20,
  extension: 3,
  bangs: 3,
  volume: 2
};

/**
 * Optional curated ordering per family: templates whose provider id appears here
 * are surfaced first (in this order) before the per-family cap is applied. These are
 * REAL provider template ids (verified from the live catalog) and this is only a
 * soft preference — an id absent from the current catalog is simply ignored, so
 * nothing is ever invented. Used to pick visually-distinct bangs.
 */
const FAMILY_PREFERRED_ORDER: Partial<Record<TryOnFamily, string[]>> = {
  bangs: ["female_blunt_bangs", "female_right_side_swept", "female_mini_fringe"]
};

/** Option-id prefix per family (also drives scenario category guessing). */
const FAMILY_PREFIX: Record<TryOnFamily, string> = {
  hairstyle: "style",
  extension: "ext",
  bangs: "bang",
  volume: "vol"
};

const FAMILY_DESCRIPTION: Record<TryOnFamily, string> = {
  hairstyle: "Preview this hairstyle on your photo to see how it might feel.",
  extension: "A wig or extension look, previewed on your photo — close to your hair today, or something new.",
  bangs: "Preview a fringe on your photo — a small change that frames the face.",
  volume: "Preview a fuller, volume-boosted look on your photo."
};

/** Group heading per family (used by the Rehearse UI). */
export const FAMILY_GROUP_LABEL: Record<TryOnFamily, string> = {
  hairstyle: "Hairstyles",
  extension: "Extensions & wigs",
  bangs: "Bangs",
  volume: "Volume"
};

/**
 * Stable option id for a family + template id. Mirrors buildOptions' scheme so the
 * UI can derive the same key from a stored preview (family + templateId) without
 * guessing — keeping preview state keyed by option, never by a bare template id
 * that could repeat across families.
 */
export function optionIdFor(family: TryOnFamily, templateId: string): string {
  return `${FAMILY_PREFIX[family]}_${templateId}`;
}

/**
 * True when a provider template is a male-presenting look. The live catalog tags
 * each template with `category_name` ("Male"/"Female") and mirrors it in the id
 * prefix (`male_...`). We surface only female-presenting looks, so male templates
 * are dropped before the per-family cap is applied. Mock templates carry no
 * category and never use a `male_` prefix, so they are always kept.
 */
function isMaleTemplate(t: VtoTemplate): boolean {
  if ((t.category ?? "").trim().toLowerCase() === "male") return true;
  return t.templateId.trim().toLowerCase().startsWith("male_");
}

/**
 * Reorder candidates so the curated preferred ids come first (in the preferred
 * order). The sort is stable, so every other template keeps its provider order.
 */
function byPreferredOrder(candidates: VtoTemplate[], preferred: string[]): VtoTemplate[] {
  const rank = new Map(preferred.map((id, i) => [id, i] as const));
  return [...candidates].sort((a, b) => {
    const ra = rank.get(a.templateId) ?? Number.MAX_SAFE_INTEGER;
    const rb = rank.get(b.templateId) ?? Number.MAX_SAFE_INTEGER;
    return ra - rb;
  });
}

/**
 * Build explorable options from the combined provider catalog, family by family,
 * each capped so the grid stays small. Order follows TRY_ON_FAMILIES (hairstyle,
 * extension, bangs, volume) so the UI can group them under stable headings.
 */
export function buildOptions(templates: VtoTemplate[]): AppearanceOption[] {
  const options: AppearanceOption[] = [];
  for (const family of TRY_ON_FAMILIES) {
    const candidates = templates
      // Keep the error-demo template and any male-presenting look out of the list.
      .filter((t) => t.family === family && !t.templateId.startsWith("mock-buzz") && !isMaleTemplate(t));
    const preferred = FAMILY_PREFERRED_ORDER[family];
    const picked = (preferred ? byPreferredOrder(candidates, preferred) : candidates).slice(0, FAMILY_CAPS[family]);
    for (const t of picked) {
      options.push({
        id: optionIdFor(family, t.templateId),
        label: t.displayName,
        description: FAMILY_DESCRIPTION[family],
        visualizable: true,
        templateIds: [t.templateId],
        sampleImageUrl: t.imageUrl ?? null,
        family,
        // Extensions play the "wig"/covering role; everything else is a hairstyle.
        category: family === "extension" ? "covering" : "hairstyle"
      });
    }
  }
  return options;
}

/**
 * Priority score for a single option (rule-based — tech-implementation.md §5). This
 * never removes the user's freedom to see all options; it only orders them.
 */
function priorityScore(option: AppearanceOption, priorities: Priority[]): number {
  const top = new Set(priorities);
  let s = 0;
  if (option.category === "hairstyle" && top.has("familiar_appearance")) s += 2;
  // Extensions are the covering role, so comfort/privacy lift them.
  if (option.category === "covering" && top.has("comfort")) s += 2;
  if (option.category === "covering" && top.has("privacy")) s += 1;
  if (option.visualizable && top.has("cost")) s -= 1; // previews cost credits; de-prioritize on cost
  return s;
}

/** Rank options by the user's priorities alone (stable — equal scores keep order). */
export function orderOptionsByPriority(options: AppearanceOption[], priorities: Priority[]): AppearanceOption[] {
  return [...options].sort((a, b) => priorityScore(b, priorities) - priorityScore(a, priorities));
}

/**
 * Final ordering: recommendation-highlighted options first (in the order the
 * recommendation lists them), then everything else by priority score. Stable, so
 * equal-ranked options keep their catalog order.
 */
export function orderOptions(
  options: AppearanceOption[],
  priorities: Priority[],
  recommendation?: Recommendation | null
): AppearanceOption[] {
  const highlighted = recommendation?.highlightedOptionIds ?? [];
  const rank = new Map<string, number>();
  highlighted.forEach((id, i) => rank.set(id, i));

  return [...options]
    .map((option, index) => ({ option, index, score: priorityScore(option, priorities) }))
    .sort((a, b) => {
      const ra = rank.has(a.option.id) ? (rank.get(a.option.id) as number) : Number.MAX_SAFE_INTEGER;
      const rb = rank.has(b.option.id) ? (rank.get(b.option.id) as number) : Number.MAX_SAFE_INTEGER;
      if (ra !== rb) return ra - rb;
      if (a.score !== b.score) return b.score - a.score;
      return a.index - b.index; // stable tiebreak
    })
    .map((x) => x.option);
}
