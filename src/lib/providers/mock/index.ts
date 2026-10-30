/**
 * Mock provider adapters — used when PROVIDER_MODE is not "live" or no API key is
 * configured. They are deterministic, consume no credits, and are clearly labelled
 * as simulated in the results they return (never silently faked as a live result).
 *
 * The mock VTO produces an SVG placeholder (not a real hairstyle render) so the
 * end-to-end flow, limits, and error handling can be exercised without a key.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import { familyImageUrl, mockIllustrationFor } from "../../images";
import type { HairDensityTerm, HairLength, TryOnFamily } from "../../types";
import type {
  HairAnalysisAdapter,
  HairAnalysisOutcome,
  HairDensityAdapter,
  HairDensityOutcome,
  HairstyleVtoAdapter,
  HairTypeAdapter,
  HairTypeOutcome,
  HairTypePhotos,
  NormalizedPhoto,
  PreviewCreation,
  PreviewOutcome,
  VtoTemplate
} from "../types";

/**
 * Curated mock templates per try-on family. IDs are prefixed `mock-` so they can
 * never be mistaken for verified provider template IDs. The non-hairstyle families
 * carry a local `imageUrl` so option cards show a thumbnail in mock mode (live mode
 * uses the provider's own thumbs instead).
 */
const MOCK_TEMPLATES_BY_FAMILY: Record<TryOnFamily, VtoTemplate[]> = {
  hairstyle: [
    { templateId: "mock-soft-bob", displayName: "Soft Bob (chin-length)", family: "hairstyle" },
    { templateId: "mock-pixie", displayName: "Pixie Cut", family: "hairstyle" },
    { templateId: "mock-shoulder", displayName: "Shoulder-Length Layers", family: "hairstyle" },
    { templateId: "mock-waves", displayName: "Gentle Waves", family: "hairstyle" },
    // Deliberately used to demonstrate the `error_hair_too_short` flow.
    { templateId: "mock-buzz", displayName: "Buzz Cut (short-source demo)", family: "hairstyle" }
  ],
  extension: [
    { templateId: "mock-ext-long", displayName: "Long Extension (wig)", family: "extension", imageUrl: familyImageUrl("extension") },
    { templateId: "mock-ext-bob", displayName: "Full Bob (wig)", family: "extension", imageUrl: familyImageUrl("extension") },
    { templateId: "mock-ext-waves", displayName: "Wavy Extension (wig)", family: "extension", imageUrl: familyImageUrl("extension") }
  ],
  bangs: [
    { templateId: "mock-bang-full", displayName: "Full Bangs", family: "bangs", imageUrl: familyImageUrl("bangs") },
    { templateId: "mock-bang-side", displayName: "Side-Swept Bangs", family: "bangs", imageUrl: familyImageUrl("bangs") },
    { templateId: "mock-bang-curtain", displayName: "Curtain Bangs", family: "bangs", imageUrl: familyImageUrl("bangs") }
  ],
  volume: [
    { templateId: "mock-vol-boost", displayName: "Root Volume Boost", family: "volume", imageUrl: familyImageUrl("volume") },
    { templateId: "mock-vol-lift", displayName: "All-Over Lift", family: "volume", imageUrl: familyImageUrl("volume") }
  ]
};

const MOCK_LENGTHS: HairLength[] = ["short", "medium", "long", "ear_length"];
const MOCK_DENSITY_TERMS: HairDensityTerm[] = ["low", "medium", "high", "medium"];
const MOCK_HAIR_TYPES: Array<{ mapping: string; term: string }> = [
  { mapping: "1 to 2a", term: "Straight to Slight Wavy" },
  { mapping: "2a to 2b", term: "Slight to Medium Wavy" },
  { mapping: "2b to 2c", term: "Medium to Thick Wavy" },
  { mapping: "3a to 3b", term: "Loose to Medium Curls" }
];

function hash(bytes: Buffer): number {
  let h = 0;
  for (let i = 0; i < bytes.length; i += 97) {
    h = (h * 31 + bytes[i]) % 100000;
  }
  return h;
}

export class MockHairAnalysisAdapter implements HairAnalysisAdapter {
  readonly mode = "mock" as const;

  async analyze(photo: NormalizedPhoto): Promise<HairAnalysisOutcome> {
    // Deterministic pick so the same photo yields the same result in demos.
    const length = MOCK_LENGTHS[hash(photo.bytes) % MOCK_LENGTHS.length];
    const raw = {
      above_ear: "above the ears",
      ear_length: "ear length",
      short: "short hair",
      medium: "above chest",
      long: "long hair",
      unknown: "unknown"
    }[length];
    return { status: "success", length, rawResult: `${raw} (simulated)`, errorCode: null };
  }
}

/** Deterministic, clearly-simulated Hair Density result (no credits). */
export class MockHairDensityAdapter implements HairDensityAdapter {
  readonly mode = "mock" as const;

  async analyze(photo: NormalizedPhoto): Promise<HairDensityOutcome> {
    const term = MOCK_DENSITY_TERMS[hash(photo.bytes) % MOCK_DENSITY_TERMS.length];
    const raw = {
      extremely_low: "Extremely Low Density",
      low: "Low Density",
      medium: "Medium Density",
      high: "High Density",
      unknown: "Unknown Density"
    }[term];
    return { status: "success", term, rawResult: `${raw} (simulated)`, errorCode: null };
  }
}

/** Deterministic, clearly-simulated Hair Type result (no credits). */
export class MockHairTypeAdapter implements HairTypeAdapter {
  readonly mode = "mock" as const;

  async analyze(photos: HairTypePhotos): Promise<HairTypeOutcome> {
    const pick = MOCK_HAIR_TYPES[hash(photos.front.bytes) % MOCK_HAIR_TYPES.length];
    return { status: "success", mapping: pick.mapping, term: pick.term, errorCode: null };
  }
}

/**
 * Load the representative illustration for a mock template from disk.
 *
 * The mock VTO has no rendering engine, so "rendering" a preview returns the
 * curated editorial illustration for that template (hairstyles use per-style art;
 * the other families use their single representative image). The bytes are a real
 * PNG, which the preview pipeline re-hosts exactly like a live provider result.
 * Honesty is carried by the UI captions ("Simulated preview · illustration"), not
 * by text baked into the image.
 */
async function loadMockImage(templateId: string): Promise<Buffer | null> {
  const rel = mockIllustrationFor(templateId);
  if (!rel) return null;
  try {
    return await readFile(path.join(process.cwd(), "public", "images", rel));
  } catch {
    return null;
  }
}

/**
 * Family-parameterized mock try-on adapter. Each instance lists only its own
 * family's templates, mirroring the live adapter, so the catalog/options layer can
 * fetch all four families uniformly.
 */
export class MockTryOnAdapter implements HairstyleVtoAdapter {
  readonly mode = "mock" as const;

  constructor(readonly family: TryOnFamily) {}

  async listTemplates(): Promise<VtoTemplate[]> {
    return MOCK_TEMPLATES_BY_FAMILY[this.family];
  }

  async createPreview(_photo: NormalizedPhoto, templateId: string): Promise<PreviewCreation> {
    // Encode the template id in the task id so getPreview is stateless.
    return { taskId: `mock-task__${templateId}__${Date.now()}` };
  }

  async getPreview(taskId: string): Promise<PreviewOutcome> {
    const templateId = taskId.split("__")[1] ?? "";
    const template = MOCK_TEMPLATES_BY_FAMILY[this.family].find((t) => t.templateId === templateId);

    // Demonstrate the documented `error_hair_too_short` path deterministically.
    if (templateId === "mock-buzz") {
      return { status: "failed", resultUrl: null, resultBytes: null, errorCode: "error_hair_too_short" };
    }
    if (!template) {
      return { status: "failed", resultUrl: null, resultBytes: null, errorCode: "unknown_template" };
    }

    const bytes = await loadMockImage(templateId);
    if (!bytes) {
      return { status: "failed", resultUrl: null, resultBytes: null, errorCode: "empty_result" };
    }
    return {
      status: "success",
      resultUrl: null,
      resultBytes: bytes,
      errorCode: null
    };
  }
}

/** Back-compat alias: the hairstyle-family mock adapter existing callers/tests import. */
export class MockHairstyleVtoAdapter extends MockTryOnAdapter {
  constructor() {
    super("hairstyle");
  }
}
