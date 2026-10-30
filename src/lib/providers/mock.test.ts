/**
 * Mock-provider tests (instruction §4, §11).
 *
 * The mock adapters power demo/offline mode. They must be deterministic, consume no
 * credits, and — importantly for §4 — reproduce the documented `error_hair_too_short`
 * flow so the "hair too short to restyle" path is a first-class, testable behaviour
 * rather than an untested edge case.
 */

import { describe, it, expect } from "vitest";
import type { HairTypePhotos, NormalizedPhoto } from "@/lib/providers/types";
import {
  MockHairAnalysisAdapter,
  MockHairDensityAdapter,
  MockHairTypeAdapter,
  MockHairstyleVtoAdapter,
  MockTryOnAdapter
} from "@/lib/providers/mock";

function photo(seed: number): NormalizedPhoto {
  const bytes = Buffer.alloc(512);
  for (let i = 0; i < bytes.length; i++) bytes[i] = (i + seed) % 256;
  return { bytes, contentType: "image/jpeg", fileName: "photo.jpg" };
}

function angles(seed: number): HairTypePhotos {
  return { front: photo(seed), right: photo(seed + 1), left: photo(seed + 2) };
}

describe("MockHairAnalysisAdapter", () => {
  const adapter = new MockHairAnalysisAdapter();

  it("reports mock mode", () => {
    expect(adapter.mode).toBe("mock");
  });

  it("returns a successful, normalized length", async () => {
    const res = await adapter.analyze(photo(1));
    expect(res.status).toBe("success");
    expect(res.errorCode).toBeNull();
    expect(["above_ear", "ear_length", "short", "medium", "long", "unknown"]).toContain(res.length);
  });

  it("is deterministic for the same photo bytes", async () => {
    const a = await adapter.analyze(photo(7));
    const b = await adapter.analyze(photo(7));
    expect(a.length).toBe(b.length);
  });

  it("labels the raw result as simulated (never silently fake)", async () => {
    const res = await adapter.analyze(photo(3));
    expect(res.rawResult).toContain("simulated");
  });
});

describe("MockHairstyleVtoAdapter", () => {
  const adapter = new MockHairstyleVtoAdapter();

  it("reports mock mode and lists prefixed template ids", async () => {
    expect(adapter.mode).toBe("mock");
    const templates = await adapter.listTemplates();
    expect(templates.length).toBeGreaterThan(0);
    expect(templates.every((t) => t.templateId.startsWith("mock-"))).toBe(true);
  });

  it("returns the representative illustration (PNG) on success", async () => {
    const { taskId } = await adapter.createPreview(photo(1), "mock-soft-bob");
    const res = await adapter.getPreview(taskId);
    expect(res.status).toBe("success");
    expect(res.errorCode).toBeNull();
    expect(res.resultBytes).not.toBeNull();
    // PNG magic bytes — the mock re-hosts a real image, not an inline SVG.
    expect(res.resultBytes![0]).toBe(0x89);
    expect(res.resultBytes![1]).toBe(0x50);
  });

  it("reproduces the error_hair_too_short flow for the buzz template", async () => {
    const { taskId } = await adapter.createPreview(photo(1), "mock-buzz");
    const res = await adapter.getPreview(taskId);
    expect(res.status).toBe("failed");
    expect(res.errorCode).toBe("error_hair_too_short");
    expect(res.resultBytes).toBeNull();
  });

  it("fails cleanly for an unknown template id", async () => {
    const res = await adapter.getPreview("mock-task__does-not-exist__0");
    expect(res.status).toBe("failed");
    expect(res.errorCode).toBe("unknown_template");
  });

  it("encodes the template id in the task id so polling is stateless", async () => {
    const { taskId } = await adapter.createPreview(photo(1), "mock-pixie");
    expect(taskId.split("__")[1]).toBe("mock-pixie");
  });
});

describe("MockHairDensityAdapter", () => {
  const adapter = new MockHairDensityAdapter();

  it("reports mock mode", () => {
    expect(adapter.mode).toBe("mock");
  });

  it("returns a successful, normalized density term", async () => {
    const res = await adapter.analyze(photo(2));
    expect(res.status).toBe("success");
    expect(res.errorCode).toBeNull();
    expect(["extremely_low", "low", "medium", "high", "unknown"]).toContain(res.term);
  });

  it("is deterministic for the same photo bytes", async () => {
    const a = await adapter.analyze(photo(9));
    const b = await adapter.analyze(photo(9));
    expect(a.term).toBe(b.term);
  });

  it("labels the raw result as simulated (never silently fake)", async () => {
    const res = await adapter.analyze(photo(4));
    expect(res.rawResult).toContain("simulated");
  });
});

describe("MockHairTypeAdapter", () => {
  const adapter = new MockHairTypeAdapter();

  it("reports mock mode", () => {
    expect(adapter.mode).toBe("mock");
  });

  it("returns a successful mapping and human-readable term", async () => {
    const res = await adapter.analyze(angles(5));
    expect(res.status).toBe("success");
    expect(res.errorCode).toBeNull();
    expect(typeof res.mapping).toBe("string");
    expect((res.term ?? "").length).toBeGreaterThan(0);
  });

  it("is deterministic for the same front photo", async () => {
    const a = await adapter.analyze(angles(11));
    const b = await adapter.analyze(angles(11));
    expect(a.term).toBe(b.term);
    expect(a.mapping).toBe(b.mapping);
  });
});

describe("MockTryOnAdapter (families)", () => {
  it("lists only its own family's templates, tagged with that family", async () => {
    for (const family of ["extension", "bangs", "volume"] as const) {
      const templates = await new MockTryOnAdapter(family).listTemplates();
      expect(templates.length).toBeGreaterThan(0);
      expect(templates.every((t) => t.family === family)).toBe(true);
    }
  });

  it("prefixes each family's template ids distinctly", async () => {
    const ext = await new MockTryOnAdapter("extension").listTemplates();
    expect(ext.every((t) => t.templateId.startsWith("mock-ext-"))).toBe(true);
    const bang = await new MockTryOnAdapter("bangs").listTemplates();
    expect(bang.every((t) => t.templateId.startsWith("mock-bang-"))).toBe(true);
    const vol = await new MockTryOnAdapter("volume").listTemplates();
    expect(vol.every((t) => t.templateId.startsWith("mock-vol-"))).toBe(true);
  });

  it("renders the representative family illustration (PNG) on success", async () => {
    const adapter = new MockTryOnAdapter("extension");
    const { taskId } = await adapter.createPreview(photo(1), "mock-ext-long");
    const res = await adapter.getPreview(taskId);
    expect(res.status).toBe("success");
    expect(res.errorCode).toBeNull();
    expect(res.resultBytes).not.toBeNull();
    expect(res.resultBytes![0]).toBe(0x89); // PNG magic bytes
    expect(res.resultBytes![1]).toBe(0x50);
  });

  it("fails cleanly for a template id that belongs to another family", async () => {
    const adapter = new MockTryOnAdapter("extension");
    const { taskId } = await adapter.createPreview(photo(1), "mock-pixie");
    const res = await adapter.getPreview(taskId);
    expect(res.status).toBe("failed");
    expect(res.errorCode).toBe("unknown_template");
  });
});
