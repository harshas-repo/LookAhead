/**
 * Simple, deterministic recommendations (instruction §7A — rules, never an LLM).
 *
 * Given what the user told us (priorities, optional treatment date) and what the
 * hair record detected (length / density / type), this highlights a few options to
 * explore first and explains why, in a calm, non-clinical voice. It never removes
 * choices or predicts anything — it only reorders and annotates. Pure and injectable
 * (`now`) so it can be unit-tested for exact determinism.
 */

import type { AppearanceOption, HairDensityTerm, HairLength, Priority, TryOnFamily } from "../types";

export interface RecommendInput {
  options: AppearanceOption[];
  priorities: Priority[];
  topPriorities: Priority[];
  /** Optional treatment date (ISO yyyy-mm-dd); never a diagnosis. */
  treatmentDate: string | null;
  /** Detected/confirmed hair length, when known. */
  length: HairLength | null;
  /** Detected density term, when known. */
  density: HairDensityTerm | null;
  /** Detected hair-type term (human-readable), when known. */
  type: string | null;
  /** Injectable clock for deterministic tests (defaults to Date.now()). */
  now?: number;
}

export interface Recommendation {
  /** A calm one-line summary shown as "Suggested for you". */
  headline: string;
  /** Option ids to lift to the top and badge as "Suggested" (max 4). */
  highlightedOptionIds: string[];
  /** Per-option reason copy, keyed by option id. */
  reasons: Record<string, string>;
}

const MAX_HIGHLIGHTS = 4;
const SOON_WEEKS = 6;

/** Whether a treatment date falls within ~SOON_WEEKS from now (upcoming). */
function isSoon(isoDate: string | null, now: number): boolean {
  if (!isoDate) return false;
  const target = new Date(`${isoDate}T00:00:00.000Z`).getTime();
  if (!Number.isFinite(target)) return false;
  const windowMs = SOON_WEEKS * 7 * 24 * 60 * 60 * 1000;
  const delta = target - now;
  return delta >= 0 && delta <= windowMs;
}

interface Context {
  density: HairDensityTerm | null;
  length: HairLength | null;
  type: string | null;
  soon: boolean;
  top: Set<Priority>;
}

function reasonForFamily(family: TryOnFamily, ctx: Context): string {
  switch (family) {
    case "extension": {
      const texture = ctx.type ? ` and can closely match your natural texture` : "";
      if (ctx.top.has("privacy")) return `A wig keeps things private${texture} — an easy, low-key option.`;
      if (ctx.top.has("comfort")) return `A wig is comfortable and easy on the scalp${texture}.`;
      return `A wig or extension can look close to your hair today${texture}.`;
    }
    case "volume":
      return "Adds the look of fullness at the roots — helpful when density reads lower.";
    case "bangs":
      return "A fringe is a small, framed change that's easy to live with.";
    case "hairstyle":
    default:
      if (ctx.length === "long" && ctx.soon) return "With treatment coming up, a shorter style can be easier to manage.";
      if (ctx.top.has("familiar_appearance")) return "A look close to how you feel like yourself today.";
      return "Preview this style on your photo to see how it might feel.";
  }
}

function buildHeadline(ctx: Context): string {
  if (ctx.density === "extremely_low" || ctx.density === "low") {
    return "Your record reads a little lower on density, so we've highlighted a few fuller-looking options to try first.";
  }
  if (ctx.length === "long" && ctx.soon) {
    return "With your treatment date coming up, here are a few easy options worth exploring first.";
  }
  if (ctx.top.has("cost")) {
    return "Browsing is free, and you can preview up to four looks — here are a few to start with.";
  }
  if (ctx.top.has("comfort") || ctx.top.has("privacy")) {
    return "Based on what matters to you, we've highlighted a few comfortable, low-key options.";
  }
  if (ctx.top.has("familiar_appearance")) {
    return "We've highlighted a few looks that stay close to how you feel like yourself.";
  }
  return "Here are a few options we think are worth exploring first.";
}

/**
 * Produce a deterministic recommendation. Highlighted options are drawn from the
 * families the rules suggest, in rule order, capped so the row stays small.
 */
export function recommend(input: RecommendInput): Recommendation {
  const now = input.now ?? Date.now();
  const top = new Set(input.topPriorities.length ? input.topPriorities : input.priorities);
  const ctx: Context = {
    density: input.density,
    length: input.length,
    type: input.type,
    soon: isSoon(input.treatmentDate, now),
    top
  };

  const suggested: TryOnFamily[] = [];
  const push = (f: TryOnFamily) => {
    if (!suggested.includes(f)) suggested.push(f);
  };

  // Lower density -> fuller-looking options.
  if (ctx.density === "extremely_low" || ctx.density === "low") {
    push("volume");
    push("extension");
  }
  // Long hair with treatment soon -> shorter styles + a wig to match.
  if (ctx.length === "long" && ctx.soon) {
    push("hairstyle");
    push("extension");
  }
  // Familiar appearance -> styles near how you look now + a matching wig.
  if (top.has("familiar_appearance")) {
    push("hairstyle");
    push("extension");
  }
  // Comfort / privacy -> the wig role.
  if (top.has("comfort") || top.has("privacy")) {
    push("extension");
  }
  // Always leave the user with at least one suggestion.
  if (suggested.length === 0) push("hairstyle");

  const highlighted: string[] = [];
  for (const family of suggested) {
    for (const option of input.options.filter((o) => o.family === family).slice(0, 2)) {
      if (!highlighted.includes(option.id)) highlighted.push(option.id);
    }
  }
  const highlightedOptionIds = highlighted.slice(0, MAX_HIGHLIGHTS);

  const reasons: Record<string, string> = {};
  for (const id of highlightedOptionIds) {
    const option = input.options.find((o) => o.id === id);
    if (option) reasons[id] = reasonForFamily(option.family ?? "hairstyle", ctx);
  }

  return { headline: buildHeadline(ctx), highlightedOptionIds, reasons };
}

/* ══════════════════════════════════════════════════════════════════════════
 * Opt-in "Suggested looks" — deterministic hairstyle ideas (never an LLM).
 *
 * Pure and isomorphic (imports only types), so it can run in the browser off the
 * already-loaded options plus the hair record. It scores the female hairstyle
 * catalog against a chosen look preference + the record's length/density/type and
 * returns the top three, with honest "ideas to consider" copy — never a prediction.
 * The live catalog exposes only {id, thumb, title, category}, so template titles are
 * the single deterministic signal for a style's length/texture.
 * ══════════════════════════════════════════════════════════════════════════ */

/** How far the user wants suggestions to stray from their hair today. */
export type LookPreference = "original" | "slightly_different" | "distinct";

export const LOOK_PREFERENCES: { id: LookPreference; label: string; hint: string }[] = [
  { id: "original", label: "Keep my usual look", hint: "Styles close to your length and texture today." },
  { id: "slightly_different", label: "A little different", hint: "One fresh change — a new length or texture." },
  { id: "distinct", label: "A distinct new look", hint: "A bolder contrast from your hair now." }
];

export type StyleLength = "short" | "medium" | "long" | "unknown";
export type StyleTexture = "straight" | "wavy" | "curly" | "crimped" | "updo" | "unknown";

export interface StyleAttributes {
  length: StyleLength;
  texture: StyleTexture;
}

const MAX_SUGGESTIONS = 3;

/**
 * Keyword heuristic that infers a style's length + texture from its catalog title —
 * the only deterministic signal the provider exposes. Returns "unknown" where the
 * title carries no clue, so scoring degrades gracefully instead of guessing.
 */
export function inferStyleAttributes(label: string): StyleAttributes {
  const l = (label ?? "").toLowerCase();
  const has = (...words: string[]) => words.some((w) => l.includes(w));

  let length: StyleLength = "unknown";
  if (has("long")) length = "long";
  else if (has("bob", "pixie", "buzz", "crop", "taper", "fade", "mini", "chin", "short")) length = "short";
  else if (has("shoulder", "lob", "medium")) length = "medium";

  let texture: StyleTexture = "unknown";
  if (has("crimp")) texture = "crimped";
  else if (has("curl", "bouncy", "coil")) texture = "curly";
  else if (has("wave", "wavy", "retro")) texture = "wavy";
  else if (has("bun", "braid", "updo")) texture = "updo";
  else if (has("sleek", "blunt", "slicked", "straight", "middle part")) texture = "straight";

  return { length, texture };
}

/** Map the normalized record length onto the coarse style-length buckets. */
function recordLengthBucket(length: HairLength | null): StyleLength {
  switch (length) {
    case "above_ear":
    case "ear_length":
    case "short":
      return "short";
    case "medium":
      return "medium";
    case "long":
      return "long";
    default:
      return "unknown";
  }
}

/** Map the provider's human-readable hair-type term onto a coarse texture. */
function recordTexture(type: string | null): StyleTexture {
  const t = (type ?? "").toLowerCase();
  if (!t) return "unknown";
  if (t.includes("coil") || t.includes("kinky") || t.includes("curl")) return "curly";
  if (t.includes("wave") || t.includes("wavy")) return "wavy";
  if (t.includes("straight")) return "straight";
  return "unknown";
}

export interface SuggestInput {
  options: AppearanceOption[];
  preference: LookPreference;
  length: HairLength | null;
  density: HairDensityTerm | null;
  type: string | null;
  /** Optional treatment date (ISO yyyy-mm-dd); used only for a gentle timing note. */
  treatmentDate: string | null;
  /** Injectable clock for deterministic tests (defaults to Date.now()). */
  now?: number;
}

export interface Suggestion {
  optionId: string;
  label: string;
  sampleImageUrl: string | null;
  reason: string;
}

export interface SuggestionResult {
  items: Suggestion[];
  headline: string;
  considerations: string[];
  mixes: string;
  /**
   * A small, honest contextual line based on how far the treatment date is from
   * today — never a medical prediction. Null when no date was given.
   */
  timingNote: string | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Build the "where you are" timing note from the treatment date.
 *
 * Pure and deterministic: parses the ISO date, computes whole days between it and
 * `now`, and returns one calm line per bucket. Phrasing stays non-clinical and
 * non-predictive ("many people...", "often", "a good time to...") because the app
 * never gives medical advice — it only acknowledges where the user is in their own
 * timeline. Returns null when there is no (parseable) date.
 */
export function buildTimingNote(treatmentDate: string | null, now: number = Date.now()): string | null {
  if (!treatmentDate) return null;
  const target = new Date(`${treatmentDate}T00:00:00.000Z`).getTime();
  if (!Number.isFinite(target)) return null;

  // Whole days from now until the date (negative = the date has passed).
  const days = Math.round((target - now) / DAY_MS);

  if (days > 14) {
    return "Your treatment date is still a little way off — a good time to explore styles at your own pace and note the ones you love.";
  }
  if (days >= 0) {
    return "With your start date close, many people find it comforting to have a plan ready — a wig, a shorter cut, or simply knowing your options.";
  }

  const since = -days; // whole days since the treatment started
  if (since <= 14) {
    return "You've just started — be gentle with yourself. Soft, low-effort looks are often the kindest right now.";
  }
  if (since <= 60) {
    return "A few weeks in, many people like having a couple of go-to looks ready for the days they feel like switching things up.";
  }
  if (since <= 150) {
    return "You're a few months in — regrowth and changing texture are common now, and a fresh style can be a nice way to mark the moment.";
  }
  return "Well into your journey, a new look can still feel like a small celebration — these ideas are here whenever you'd like them.";
}

/**
 * Return up to three female hairstyle ideas for the chosen preference, scored
 * against the hair record. Deterministic: stable tie-break by catalog order. Copy
 * stays honest ("ideas to consider"), and a missing record simply scores by
 * preference with an "add photos for tailored picks" note.
 */
export function suggestHairstyles(input: SuggestInput): SuggestionResult {
  const recLength = recordLengthBucket(input.length);
  const recTexture = recordTexture(input.type);
  const lowDensity = input.density === "low" || input.density === "extremely_low";
  const hasRecord = recLength !== "unknown" || recTexture !== "unknown";

  const scored = input.options
    .map((option, index) => ({ option, index }))
    .filter(({ option }) => (option.family ?? "hairstyle") === "hairstyle")
    .map(({ option, index }) => {
      const attrs = inferStyleAttributes(option.label);
      const lengthMatch = recLength !== "unknown" && attrs.length === recLength;
      const textureMatch = recTexture !== "unknown" && attrs.texture === recTexture;
      const lengthDiff = recLength !== "unknown" && attrs.length !== "unknown" && attrs.length !== recLength;
      const textureDiff = recTexture !== "unknown" && attrs.texture !== "unknown" && attrs.texture !== recTexture;
      const changes = (lengthDiff ? 1 : 0) + (textureDiff ? 1 : 0);
      const fuller = attrs.texture === "wavy" || attrs.texture === "curly" || attrs.texture === "crimped";

      let score = 0;
      if (input.preference === "original") {
        if (lengthMatch) score += 3;
        if (textureMatch) score += 2;
        if (!hasRecord && attrs.length === "unknown" && attrs.texture === "unknown") score += 1;
      } else if (input.preference === "slightly_different") {
        if (changes === 1) score += 3;
        else if (changes === 0) score += 1.5;
        else score += 1;
      } else {
        // distinct — reward contrast on both axes, with directional bonuses.
        if (changes >= 2) score += 3;
        else if (changes === 1) score += 2;
        if (recLength === "long" && attrs.length === "short") score += 1;
        if (recLength === "short" && attrs.length === "long") score += 1;
        if (recTexture === "straight" && fuller) score += 1;
      }

      // Lower density nudges toward fuller textures and away from sleek/flat.
      if (lowDensity) {
        if (fuller) score += 1.5;
        if (attrs.texture === "straight") score -= 1.5;
      }

      return { option, index, score, attrs, lengthMatch, textureMatch };
    });

  scored.sort((a, b) => b.score - a.score || a.index - b.index);
  const top = scored.slice(0, MAX_SUGGESTIONS);

  const items: Suggestion[] = top.map(({ option, attrs, lengthMatch, textureMatch }) => ({
    optionId: option.id,
    label: option.label,
    sampleImageUrl: option.sampleImageUrl ?? null,
    reason: reasonForSuggestion(input.preference, attrs, lengthMatch, textureMatch, hasRecord, lowDensity)
  }));

  return {
    items,
    headline: buildSuggestionHeadline(input.preference, hasRecord, items.length),
    considerations: buildConsiderations(recLength, recTexture, lowDensity, hasRecord),
    mixes: buildMixes(recLength, lowDensity, input.preference),
    timingNote: buildTimingNote(input.treatmentDate, input.now ?? Date.now())
  };
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function reasonForSuggestion(
  preference: LookPreference,
  attrs: StyleAttributes,
  lengthMatch: boolean,
  textureMatch: boolean,
  hasRecord: boolean,
  lowDensity: boolean
): string {
  const fuller = attrs.texture === "wavy" || attrs.texture === "curly" || attrs.texture === "crimped";
  const bits: string[] = [];
  if (preference === "original") {
    if (lengthMatch && textureMatch) bits.push("close to your length and texture today");
    else if (lengthMatch) bits.push("keeps a length similar to your hair now");
    else if (textureMatch) bits.push("echoes your natural texture");
    else if (!hasRecord) bits.push("a comfortable, familiar look to start from");
    else bits.push("an easy, close-to-home option");
  } else if (preference === "slightly_different") {
    if (lengthMatch && !textureMatch) bits.push("keeps your length but shifts the texture");
    else if (!lengthMatch && textureMatch) bits.push("a fresh length while keeping your texture");
    else bits.push("a gentle change worth considering");
  } else {
    bits.push("a distinct direction from your hair today");
  }
  if (lowDensity && fuller) bits.push("its fuller texture reads softly when density is lower");
  return `${capitalize(bits[0])}${bits
    .slice(1)
    .map((b) => `, ${b}`)
    .join("")}.`;
}

function buildSuggestionHeadline(preference: LookPreference, hasRecord: boolean, count: number): string {
  const prefLabel =
    preference === "original"
      ? "close to your usual look"
      : preference === "slightly_different"
        ? "a little different"
        : "a distinct new direction";
  const tailored = hasRecord ? "tailored to your hair record" : "drawn from the catalog";
  if (count === 0) return `No hairstyle ideas matched just yet — these are only suggestions to consider.`;
  return `Here ${count === 1 ? "is" : "are"} ${count} ${prefLabel}, ${tailored} — ideas to consider, never a prediction.`;
}

function buildConsiderations(
  recLength: StyleLength,
  recTexture: StyleTexture,
  lowDensity: boolean,
  hasRecord: boolean
): string[] {
  const tips: string[] = [];
  if (!hasRecord) tips.push("Add photos in Prepare for picks tailored to your length, density, and type.");
  if (recLength === "long") tips.push("Longer hair is versatile — preview a shorter look without cutting anything.");
  else if (recLength === "short") tips.push("From a shorter base, an extension or wig can add length for special days.");
  if (lowDensity) tips.push("Softer waves, curls, or crimps read fuller and can feel gentler when density is lower.");
  else if (recTexture === "straight") tips.push("If your hair is straight, temporary waves or curls can add texture.");
  tips.push("These are ideas to consider, not a prediction of how you will look.");
  return tips.slice(0, 3);
}

function buildMixes(recLength: StyleLength, lowDensity: boolean, preference: LookPreference): string {
  const parts: string[] = [];
  if (preference === "original") {
    parts.push("keep your length and add a fringe or a soft volume boost for a change that still feels like you");
  } else if (preference === "slightly_different") {
    parts.push("try a new texture at your current length, or side-swept bangs to frame the face");
  } else {
    parts.push(
      recLength === "long"
        ? "pair a shorter cut with a matching wig so you can move between lengths"
        : "add length with an extension or wig for a bolder, distinct look"
    );
  }
  if (lowDensity) parts.push("combine a fuller texture with a root volume boost");
  return `You can mix families too: ${parts.join("; ")}.`;
}
