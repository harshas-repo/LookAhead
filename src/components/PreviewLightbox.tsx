"use client";

/**
 * PreviewLightbox — a calm, dependency-free full-screen viewer for rendered
 * preview images.
 *
 * Interaction model (all discoverable via the on-screen controls):
 *   - mouse wheel / pinch-free scroll to zoom (1× – 5×),
 *   - click or tap to toggle 1× ↔ 2.5×,
 *   - drag to pan while zoomed,
 *   - +/−/reset buttons, Esc or the backdrop to close.
 *
 * The overlay locks body scroll while open and returns focus to the close
 * button, so keyboard users always have an obvious way out.
 */

import { useCallback, useEffect, useRef, useState } from "react";

const MIN_SCALE = 1;
const MAX_SCALE = 5;
const DOUBLE_CLICK_SCALE = 2.5;

export interface LightboxTarget {
  src: string;
  label: string;
}

export function PreviewLightbox({ target, onClose }: { target: LightboxTarget; onClose: () => void }) {
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const dragOrigin = useRef<{ x: number; y: number } | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  // Esc closes; body scroll is locked while the viewer is open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  const clampOffset = useCallback((next: { x: number; y: number }, s: number) => {
    if (s <= MIN_SCALE) return { x: 0, y: 0 };
    const bound = 60 * s * s; // generous but finite panning room
    return {
      x: Math.max(-bound, Math.min(bound, next.x)),
      y: Math.max(-bound, Math.min(bound, next.y))
    };
  }, []);

  const zoomBy = useCallback(
    (factor: number) => {
      setScale((s) => {
        const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, s * factor));
        setOffset((o) => clampOffset(next === MIN_SCALE ? { x: 0, y: 0 } : o, next));
        return next;
      });
    },
    [clampOffset]
  );

  const reset = useCallback(() => {
    setScale(1);
    setOffset({ x: 0, y: 0 });
  }, []);

  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      zoomBy(e.deltaY < 0 ? 1.18 : 1 / 1.18);
    },
    [zoomBy]
  );

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (scale <= MIN_SCALE) return;
      (e.target as Element).setPointerCapture?.(e.pointerId);
      dragOrigin.current = { x: e.clientX - offset.x, y: e.clientY - offset.y };
      setDragging(true);
    },
    [scale, offset]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragging || !dragOrigin.current) return;
      setOffset(
        clampOffset({ x: e.clientX - dragOrigin.current.x, y: e.clientY - dragOrigin.current.y }, scale)
      );
    },
    [dragging, scale, clampOffset]
  );

  const endDrag = useCallback(() => {
    dragOrigin.current = null;
    setDragging(false);
  }, []);

  const handleClick = useCallback(() => {
    if (scale > MIN_SCALE) {
      reset();
    } else {
      setScale(DOUBLE_CLICK_SCALE);
    }
  }, [scale, reset]);

  const zoomed = scale > MIN_SCALE;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Enlarged preview: ${target.label}`}
      className="fixed inset-0 z-50 flex flex-col bg-ink/90 backdrop-blur-sm"
      onClick={onClose}
    >
      {/* ── Control bar ─────────────────────────────────────────────── */}
      <div
        className="flex items-center justify-between gap-4 px-4 py-3 text-paper sm:px-6"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="min-w-0 truncate text-sm text-paper/85">
          {target.label}
          <span className="ml-2 hidden text-xs text-paper/55 sm:inline">
            Scroll to zoom · drag to pan · click to {zoomed ? "reset" : "enlarge"}
          </span>
        </p>
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={() => zoomBy(1 / 1.35)}
            disabled={!zoomed}
            aria-label="Zoom out"
            className="grid h-9 w-9 place-items-center rounded-lg border border-paper/25 text-lg leading-none transition-colors hover:bg-paper/10 disabled:opacity-35"
          >
            −
          </button>
          <button
            type="button"
            onClick={reset}
            aria-label="Reset zoom"
            className="h-9 rounded-lg border border-paper/25 px-2.5 text-xs tabular-nums transition-colors hover:bg-paper/10"
          >
            {Math.round(scale * 100)}%
          </button>
          <button
            type="button"
            onClick={() => zoomBy(1.35)}
            disabled={scale >= MAX_SCALE}
            aria-label="Zoom in"
            className="grid h-9 w-9 place-items-center rounded-lg border border-paper/25 text-lg leading-none transition-colors hover:bg-paper/10 disabled:opacity-35"
          >
            +
          </button>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label="Close enlarged view"
            className="ml-2 grid h-9 w-9 place-items-center rounded-lg border border-paper/25 text-sm transition-colors hover:bg-paper/10"
          >
            ✕
          </button>
        </div>
      </div>

      {/* ── Image stage ─────────────────────────────────────────────── */}
      <div
        className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden px-4 pb-6"
        onWheel={handleWheel}
        onClick={(e) => e.stopPropagation()}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={target.src}
          alt={target.label}
          draggable={false}
          onClick={handleClick}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={endDrag}
          onPointerLeave={endDrag}
          className={
            "max-h-full max-w-full select-none rounded-card border border-paper/15 object-contain shadow-lift transition-transform duration-150 ease-out " +
            (zoomed ? (dragging ? "cursor-grabbing" : "cursor-grab") : "cursor-zoom-in")
          }
          style={{
            transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
            transitionDuration: dragging ? "0ms" : undefined
          }}
        />
      </div>
    </div>
  );
}
