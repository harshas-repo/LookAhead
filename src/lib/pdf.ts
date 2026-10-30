/**
 * Client-side PDF export of the plan summary.
 *
 * Builds a calm, self-contained A4 document that captures ONLY the finished plan
 * (never the on-screen editors): what matters most, Plan A / Plan B, today's hair
 * record, the previews the user actually explored (embedded as images), anything
 * still left open, and the care-team questions. It reports exactly what the user
 * chose and never invents content — unresolved items stay honestly "open", and
 * previews are captioned as illustrations, never predictions.
 *
 * Preview images are fetched same-origin through the authenticated endpoint and
 * embedded as data URLs, so the saved file stands alone offline. jsPDF only ever
 * runs in the browser: callers load this module with a dynamic import inside a
 * click handler, so nothing here is evaluated during SSR.
 */

import { jsPDF } from "jspdf";
import { api } from "@/lib/api-client";
import type { PublicPreview } from "@/lib/api/serialize";
import type { PlanSummary } from "@/lib/decision/engine";
import { PRIORITY_LABELS } from "@/lib/labels";

export interface PlanPdfInput {
  plan: PlanSummary;
  /** session.previews — the gallery shows only the ones that truly succeeded. */
  previews: PublicPreview[];
  sessionId: string;
  token: string;
}

/* ── Page geometry (A4, millimetres) ────────────────────────────────────── */
const PAGE_W = 210;
const PAGE_H = 297;
const M = 16;
const CONTENT_W = PAGE_W - M * 2; // 178
const PT_TO_MM = 0.3528;

/* ── Palette (mirrors the on-screen editorial tokens) ───────────────────── */
type RGB = [number, number, number];
const INK: RGB = [32, 36, 58];
const BODY: RGB = [58, 62, 80];
const SUBTLE: RGB = [102, 105, 120];
const ACCENT: RGB = [75, 71, 201]; // periwinkle-deep
const HAIRLINE: RGB = [222, 220, 213];
const CORAL: RGB = [164, 72, 47]; // "still deciding"

/** A raster image ready to embed, with its natural size for aspect-correct fit. */
interface RasterImage {
  dataUrl: string;
  format: "JPEG" | "PNG";
  w: number;
  h: number;
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result));
    fr.onerror = () => reject(fr.error ?? new Error("Could not read image"));
    fr.readAsDataURL(blob);
  });
}

function naturalSize(src: string): Promise<{ w: number; h: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth || 4, h: img.naturalHeight || 5 });
    // Keep a sane portrait aspect so layout never divides by zero.
    img.onerror = () => resolve({ w: 4, h: 5 });
    img.src = src;
  });
}

/** Fetch one preview image as an embeddable raster. Returns null on any failure. */
async function loadRaster(url: string): Promise<RasterImage | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    const type = (blob.type || "").toLowerCase();
    // jsPDF embeds rasters only; the provider can re-host SVG, which we skip.
    let format: "JPEG" | "PNG";
    if (type.includes("png")) format = "PNG";
    else if (type.includes("jpeg") || type.includes("jpg")) format = "JPEG";
    else return null;
    const dataUrl = await blobToDataUrl(blob);
    const { w, h } = await naturalSize(dataUrl);
    return { dataUrl, format, w, h };
  } catch {
    return null;
  }
}

/**
 * Compose and download the plan summary as a PDF. Resolves once the browser has
 * been handed the file; individual preview images that fail to load are skipped
 * rather than aborting the whole document (the text plan is always complete).
 */
export async function downloadPlanPdf({ plan, previews, sessionId, token }: PlanPdfInput): Promise<void> {
  const doc = new jsPDF({ unit: "mm", format: "a4", compress: true });
  doc.setProperties({
    title: "LookAhead — Your plan",
    subject: "Appearance plan summary",
    creator: "LookAhead"
  });

  let y = M;
  const fill = (c: RGB) => doc.setFillColor(c[0], c[1], c[2]);
  const ink = (c: RGB) => doc.setTextColor(c[0], c[1], c[2]);
  const stroke = (c: RGB) => doc.setDrawColor(c[0], c[1], c[2]);

  function need(h: number) {
    if (y + h > PAGE_H - M) {
      doc.addPage();
      y = M;
    }
  }

  function rule(gapBefore = 2, gapAfter = 6) {
    y += gapBefore;
    stroke(HAIRLINE);
    doc.setLineWidth(0.3);
    doc.line(M, y, PAGE_W - M, y);
    y += gapAfter;
  }

  function heading(label: string, color: RGB = ACCENT) {
    need(13);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    ink(color);
    doc.text(label.toUpperCase(), M, y + 3, { charSpace: 0.6 });
    y += 9;
  }

  /** Wrapped paragraph; advances y and breaks pages between lines. */
  function para(
    content: string,
    opts: {
      size?: number;
      color?: RGB;
      style?: "normal" | "bold" | "italic";
      x?: number;
      width?: number;
      gapBefore?: number;
      gapAfter?: number;
      lineHeight?: number;
    } = {}
  ) {
    const size = opts.size ?? 10;
    const lh = size * PT_TO_MM * (opts.lineHeight ?? 1.35);
    const x = opts.x ?? M;
    const width = opts.width ?? CONTENT_W;
    y += opts.gapBefore ?? 0;
    doc.setFont("helvetica", opts.style ?? "normal");
    doc.setFontSize(size);
    ink(opts.color ?? BODY);
    const lines = doc.splitTextToSize(content, width) as string[];
    const ascent = size * PT_TO_MM * 0.82;
    for (const ln of lines) {
      need(lh);
      doc.text(ln, x, y + ascent);
      y += lh;
    }
    y += opts.gapAfter ?? 3;
  }

  /** A list with drawn markers (shapes, so nothing depends on font glyphs). */
  function bulletList(
    items: string[],
    opts: { color?: RGB; markerColor?: RGB; size?: number; marker?: "dot" | "dash" } = {}
  ) {
    const size = opts.size ?? 10;
    const color = opts.color ?? BODY;
    const markerColor = opts.markerColor ?? ACCENT;
    const marker = opts.marker ?? "dot";
    const lh = size * PT_TO_MM * 1.35;
    const indent = 6;
    const ascent = size * PT_TO_MM * 0.8;
    for (const item of items) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(size);
      const lines = doc.splitTextToSize(item, CONTENT_W - indent) as string[];
      need(lines.length * lh + 2);
      const markY = y + size * PT_TO_MM * 0.45;
      if (marker === "dot") {
        fill(markerColor);
        doc.circle(M + 1.4, markY, 0.85, "F");
      } else {
        stroke(markerColor);
        doc.setLineWidth(0.6);
        doc.line(M, markY, M + 3, markY);
      }
      ink(color);
      lines.forEach((ln, i) => doc.text(ln, M + indent, y + ascent + i * lh));
      y += lines.length * lh + 1.5;
    }
  }

  /** A label / value line (value wraps in the right column), ruled underneath. */
  function fieldRow(label: string, value: string) {
    need(12);
    const y0 = y;
    const labelW = 24;
    const valueX = M + labelW;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    ink(SUBTLE);
    doc.text(label.toUpperCase(), M, y0 + 3.4, { charSpace: 0.4 });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    ink(BODY);
    const lines = doc.splitTextToSize(value, CONTENT_W - labelW) as string[];
    const lh = 10 * PT_TO_MM * 1.35;
    lines.forEach((ln, i) => doc.text(ln, valueX, y0 + 3.6 + i * lh));
    y = y0 + Math.max(lines.length * lh + 2, 7);
    rule(1, 5);
  }

  /** A plan slot: label + chosen value, with an optional preview thumbnail. */
  function planRow(
    label: string,
    entry: { label: string; preview: { id: string; status: string } | null } | null,
    thumb: RasterImage | null
  ) {
    const thumbH = 26;
    need(thumb ? thumbH + 8 : 12);
    const y0 = y;
    const labelW = 24;
    const valueX = M + labelW;
    const thumbW = thumb ? thumbH * (thumb.w / thumb.h) : 0;
    const valueW = CONTENT_W - labelW - (thumb ? thumbW + 6 : 0);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    ink(SUBTLE);
    doc.text(label.toUpperCase(), M, y0 + 3.4, { charSpace: 0.4 });

    const chosen = Boolean(entry);
    const valueText = entry ? entry.label : "Not chosen yet — leaving this open is fine.";
    doc.setFont("helvetica", chosen ? "bold" : "normal");
    doc.setFontSize(10.5);
    ink(chosen ? INK : SUBTLE);
    const vLines = doc.splitTextToSize(valueText, valueW) as string[];
    const vLh = 10.5 * PT_TO_MM * 1.35;
    vLines.forEach((ln, i) => doc.text(ln, valueX, y0 + 3.8 + i * vLh));
    const valueH = 3.8 + vLines.length * vLh;

    if (thumb) {
      const tx = PAGE_W - M - thumbW;
      stroke(HAIRLINE);
      doc.setLineWidth(0.3);
      doc.rect(tx, y0, thumbW, thumbH);
      doc.addImage(thumb.dataUrl, thumb.format, tx, y0, thumbW, thumbH);
    }

    y = y0 + Math.max(valueH, thumb ? thumbH : 0) + 1;
    rule(1, 5);
  }

  /** A uniform grid of contained images with aligned captions. */
  function gallery(images: Array<{ img: RasterImage; caption: string }>) {
    if (images.length === 0) return;
    const cols = 3;
    const gap = 6;
    const cellW = (CONTENT_W - gap * (cols - 1)) / cols;
    const maxCellH = 70;
    const captionH = 9;
    for (let i = 0; i < images.length; i += cols) {
      const row = images.slice(i, i + cols);
      const rowH = Math.min(maxCellH, Math.max(...row.map(({ img }) => cellW * (img.h / img.w))));
      need(rowH + captionH + gap);
      row.forEach(({ img, caption }, j) => {
        const cx = M + j * (cellW + gap);
        // Contain-fit inside the cell, centred, so nothing is distorted.
        const fitW = Math.min(cellW, rowH * (img.w / img.h));
        const fitH = Math.min(rowH, cellW * (img.h / img.w));
        const ox = cx + (cellW - fitW) / 2;
        const oy = y + (rowH - fitH) / 2;
        stroke(HAIRLINE);
        doc.setLineWidth(0.3);
        doc.rect(cx, y, cellW, rowH);
        doc.addImage(img.dataUrl, img.format, ox, oy, fitW, fitH);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        ink(SUBTLE);
        const cLines = (doc.splitTextToSize(caption, cellW - 2) as string[]).slice(0, 2);
        cLines.forEach((ln, k) => doc.text(ln, cx + 0.5, y + rowH + 4 + k * 3.4));
      });
      y += rowH + captionH + gap;
    }
  }

  /* ── Prefetch every image we may embed (memoised by preview id) ────────── */
  const successes = previews.filter((p) => p.status === "success");
  const imgCache = new Map<string, RasterImage | null>();
  const wanted = new Set<string>(successes.map((p) => p.id));
  if (plan.planA?.preview?.status === "success") wanted.add(plan.planA.preview.id);
  if (plan.planB?.preview?.status === "success") wanted.add(plan.planB.preview.id);
  await Promise.all(
    [...wanted].map(async (pid) => {
      const img = await loadRaster(api.previewUrl(sessionId, token, pid));
      imgCache.set(pid, img);
    })
  );
  const thumbFor = (entry: { preview: { id: string; status: string } | null } | null): RasterImage | null => {
    if (!entry?.preview || entry.preview.status !== "success") return null;
    return imgCache.get(entry.preview.id) ?? null;
  };

  /* ── Document header ───────────────────────────────────────────────────── */
  const prepared = new Date(plan.createdAt).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric"
  });
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  ink(ACCENT);
  doc.text("LOOKAHEAD · YOUR APPEARANCE PLAN", M, y + 3, { charSpace: 0.8 });
  y += 9;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  ink(INK);
  doc.text("Your plan, in one place", M, y + 7);
  y += 12;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  ink(SUBTLE);
  doc.text(`Prepared ${prepared}`, M, y + 3.5);
  y += 8;
  rule(0, 7);

  /* ── What matters most ─────────────────────────────────────────────────── */
  heading("What matters most");
  if (plan.priorities.length > 0) {
    bulletList(
      plan.priorities.map((p) => {
        const label = PRIORITY_LABELS[p]?.label ?? p;
        return plan.topPriorities.includes(p) ? `${label}  ·  matters most` : label;
      })
    );
    if (plan.topPriorities.length > 0) {
      para("Marked items are the one or two that matter most.", {
        size: 8.5,
        color: SUBTLE,
        gapBefore: 1,
        gapAfter: 2
      });
    }
  } else {
    para("No priorities recorded yet.", { size: 9.5, color: SUBTLE });
  }
  rule(3, 6);

  /* ── The plan itself ───────────────────────────────────────────────────── */
  heading("Your plan");
  planRow("Plan A", plan.planA, thumbFor(plan.planA));
  planRow("Plan B", plan.planB, thumbFor(plan.planB));

  const hair = plan.hairRecord;
  let hairText = "Not recorded.";
  if (hair) {
    hairText = hair.finalLabel;
    if (hair.source === "user" && hair.detected && hair.detected !== hair.userCorrected) {
      hairText += ` · you adjusted this from “${hair.detected}”`;
    }
    hairText += " · a description of today, never a prediction.";
  }
  fieldRow("Hair today", hairText);

  if (plan.optionalTreatmentDate) {
    const [yy, mm, dd] = plan.optionalTreatmentDate.split("-").map(Number);
    if (yy && mm && dd) {
      const timing = new Date(yy, mm - 1, dd).toLocaleDateString(undefined, {
        month: "long",
        day: "numeric",
        year: "numeric"
      });
      fieldRow("Timing", `Around ${timing} · optional, and never a diagnosis.`);
    }
  }
  rule(2, 6);

  /* ── Previews you explored (the visual record) ─────────────────────────── */
  const galleryItems = successes
    .map((p) => ({ img: imgCache.get(p.id) ?? null, caption: p.displayName }))
    .filter((it): it is { img: RasterImage; caption: string } => Boolean(it.img));
  if (galleryItems.length > 0) {
    heading("Previews you explored");
    para("Rendered on your photo to help you imagine a look — never a prediction of how you will look.", {
      size: 9,
      color: SUBTLE,
      gapAfter: 4
    });
    gallery(galleryItems);
    rule(2, 6);
  }

  /* ── Still deciding — honest, not an error ─────────────────────────────── */
  if (plan.unresolved.length > 0) {
    heading("Still deciding", CORAL);
    para("Leaving these open is completely fine — they're kept here so nothing gets lost.", {
      size: 9.5,
      color: BODY,
      gapAfter: 3
    });
    bulletList(
      plan.unresolved.map((d) => d.prompt),
      { marker: "dot", markerColor: CORAL, color: BODY }
    );
    rule(3, 6);
  }

  /* ── Questions for my care team ────────────────────────────────────────── */
  heading("Questions for my care team");
  if (plan.questionsForCareTeam.length > 0) {
    bulletList(plan.questionsForCareTeam, { marker: "dash" });
  } else {
    para(
      "Nothing written yet. LookAhead doesn't answer medical questions — add anything you'd like to ask a professional.",
      { size: 9.5, color: SUBTLE }
    );
  }
  rule(3, 6);

  /* ── Honest footer ─────────────────────────────────────────────────────── */
  need(26);
  para(
    "This is a personal planning aid, not medical advice, and it doesn't predict how treatment will affect you. Any hairstyle previews are illustrations or simulations to help you imagine a look — never photographs of a future result. Bring your questions to a qualified professional.",
    { size: 8, color: SUBTLE, lineHeight: 1.45 }
  );

  const stamp = plan.createdAt.slice(0, 10);
  doc.save(stamp ? `LookAhead-plan-${stamp}.pdf` : "LookAhead-plan.pdf");
}
