/**
 * Human-readable labels for domain enums.
 *
 * Centralised so the decision engine, the guide, and the UI all speak with one
 * calm, non-clinical voice (instruction §8: warm, editorial, never hospital-like).
 */

import type {
  HairAnalysisResult,
  HairDensityResult,
  HairDensityTerm,
  HairLength,
  HairTypeResult,
  Priority,
  Stage
} from "./types";

export const PRIORITY_LABELS: Record<Priority, { label: string; hint: string }> = {
  familiar_appearance: {
    label: "Looking like myself",
    hint: "Staying close to how you look and feel today."
  },
  comfort: {
    label: "Physical comfort",
    hint: "How something feels on your head and skin, day to day."
  },
  privacy: {
    label: "Privacy",
    hint: "Choosing how much, or how little, others notice."
  },
  cost: {
    label: "Cost",
    hint: "Keeping things within a budget that works for you."
  },
  control_timing: {
    label: "Control & timing",
    hint: "Deciding what happens, and when, on your own terms."
  }
};

export const HAIR_LENGTH_LABELS: Record<HairLength, string> = {
  above_ear: "Above the ear",
  ear_length: "Ear length",
  short: "Short",
  medium: "Medium (around the collarbone)",
  long: "Long",
  unknown: "Not detected"
};

/** Human-readable density labels (badge / standalone use). */
export const HAIR_DENSITY_LABELS: Record<HairDensityTerm, string> = {
  extremely_low: "Extremely low density",
  low: "Low density",
  medium: "Medium density",
  high: "High density",
  unknown: "Density not detected"
};

/** Exact provider term strings -> internal enum (reference / UI mapping). */
export const DENSITY_TERM_FROM_PROVIDER: Record<string, HairDensityTerm> = {
  "Extremely Low Density": "extremely_low",
  "Low Density": "low",
  "Medium Density": "medium",
  "High Density": "high"
};

/** Short, lowercase phrases used inside the warm record sentence. */
const LENGTH_SENTENCE_PHRASE: Record<HairLength, string> = {
  above_ear: "above the ear",
  ear_length: "ear length",
  short: "short",
  medium: "medium length",
  long: "long",
  unknown: ""
};

const DENSITY_SENTENCE_PHRASE: Record<HairDensityTerm, string> = {
  extremely_low: "extremely low density",
  low: "low density",
  medium: "medium density",
  high: "high density",
  unknown: ""
};

/** One run of text in the record sentence; `bold` marks a detected API value. */
export interface HairRecordSegment {
  text: string;
  bold: boolean;
}

export interface HairRecordSentenceInput {
  length: HairAnalysisResult | null;
  density: HairDensityResult | null;
  type: HairTypeResult | null;
}

const HONESTY_NOTE = "A description of today, never a prediction.";

function lengthPhrase(a: HairAnalysisResult | null): string | null {
  if (!a || a.status !== "success") return null;
  // A user correction always wins over the detected value.
  return LENGTH_SENTENCE_PHRASE[a.userCorrection ?? a.length] || null;
}

function densityPhrase(d: HairDensityResult | null): string | null {
  if (!d || d.status !== "success" || d.term === "unknown") return null;
  return DENSITY_SENTENCE_PHRASE[d.term] || null;
}

function typePhrase(t: HairTypeResult | null): string | null {
  if (!t || t.status !== "success" || !t.term) return null;
  return t.term.trim().toLowerCase() || null;
}

/**
 * Compose the warm hair-record sentence as bold/non-bold segments so the UI can
 * render the detected API values in <strong> while keeping the surrounding prose
 * plain. Only detections that actually succeeded are included, so the sentence
 * gracefully shortens (length only -> length + density -> all three). It always
 * ends with the honesty note: this describes today, it never predicts.
 */
export function hairRecordSegments(input: HairRecordSentenceInput): HairRecordSegment[] {
  const descriptors: HairRecordSegment[][] = [];
  const lp = lengthPhrase(input.length);
  const dp = densityPhrase(input.density);
  const tp = typePhrase(input.type);
  if (lp) descriptors.push([{ text: lp, bold: true }]);
  if (dp) descriptors.push([{ text: dp, bold: true }]);
  if (tp) {
    descriptors.push([
      { text: "a ", bold: false },
      { text: tp, bold: true },
      { text: " pattern", bold: false }
    ]);
  }

  if (descriptors.length === 0) {
    return [{ text: HONESTY_NOTE, bold: false }];
  }

  const segments: HairRecordSegment[] = [{ text: "Your hair today reads as ", bold: false }];
  descriptors.forEach((clause, i) => {
    if (i > 0) {
      const isLast = i === descriptors.length - 1;
      const joiner = isLast ? (descriptors.length === 2 ? " and " : ", and ") : ", ";
      segments.push({ text: joiner, bold: false });
    }
    segments.push(...clause);
  });
  segments.push({ text: ". ", bold: false });
  segments.push({ text: HONESTY_NOTE, bold: false });
  return segments;
}

/** Plain-text form of the record sentence (for the print summary / <title>-like use). */
export function hairRecordSentence(input: HairRecordSentenceInput): string {
  return hairRecordSegments(input)
    .map((s) => s.text)
    .join("");
}

export const STAGE_LABELS: Record<Stage, string> = {
  START: "Welcome",
  PROFILE: "What matters to you",
  PHOTO_CAPTURE: "Your photo",
  HAIR_ANALYSIS: "Hair record",
  PREPARATION: "Preparing early",
  OPTION_EXPLORATION: "Exploring options",
  PLAN_A: "Plan A",
  SCENARIO_REHEARSAL: "Rehearsing scenarios",
  PLAN_B: "Plan B",
  PLAN_REVIEW: "Your plan",
  COMPLETE: "Ready"
};

/** Plain-language explanations for known provider error codes (instruction §5). */
export const ERROR_COPY: Record<string, { title: string; body: string }> = {
  error_hair_too_short: {
    title: "This style needs a little more length",
    body: "Hairstyle previews restyle the hair that's there. When hair is very short, this particular style can't be rendered — it isn't a problem with your photo, and it doesn't limit your real choices. You can try a different style, or explore covering options that aren't shown as previews."
  },
  error_no_face_detected: {
    title: "We couldn't find a clear face",
    body: "Try a photo where your face is front-facing, evenly lit, and not covered. You can retake or upload a new one at any time."
  },
  error_multiple_faces: {
    title: "More than one face in the photo",
    body: "Please use a photo with just you in it so the preview is accurate."
  }
};

export function describeError(code: string | null): { title: string; body: string } {
  if (code && ERROR_COPY[code]) return ERROR_COPY[code];
  return {
    title: "That didn't go through",
    body: "Something interrupted this step. Nothing was lost — you can try again, or continue without it. Previews aren't retried automatically, so your limits are respected."
  };
}

export function priorityLabel(p: Priority): string {
  return PRIORITY_LABELS[p]?.label ?? p;
}
