// components/training/layout/sheet/SheetOverlay.tsx
"use client";

import React, { useCallback, useEffect, useMemo, useRef } from "react";
import { PR_COLORS, getMidiRange, type Phrase } from "@/utils/stage";
import { hzToMidi, midiToNoteName } from "@/utils/pitch/pitchMath";
import type { SystemLayout } from "./vexscore/types";

type Props = {
  width: number;
  height: number;
  phrase: Phrase;
  running: boolean;
  startAtMs?: number | null;
  leadInSec?: number;

  staffStartX?: number | null; // legacy
  staffEndX?: number | null;   // legacy
  systems?: SystemLayout[];

  livePitchHz?: number | null;
  confidence?: number;
  confThreshold?: number;
  a4Hz?: number;

  /** MELODY clef printed on the TOP staff. Mapping is always against this clef. */
  clef?: "treble" | "bass" | null;
  useSharps?: boolean | null;

  /** (Kept for parity with props; not used for folding anymore) */
  lowHz?: number | null;
  highHz?: number | null;
};

/* ---------------- staff geometry helpers (top staff only) ---------------- */

const STEP_TOP = 8 as const;          // 8 diatonic steps from bottom line to top line
const STAFF_GAP_EST = 14;
const TWO_STAVES_THRESHOLD = 140;

const LETTER_TO_IDX: Record<string, number> = { C: 0, D: 1, E: 2, F: 3, G: 4, A: 5, B: 6 };

function diatonicIndex(letterIdx: number, octave: number) {
  return 7 * octave + letterIdx;
}

// Base reference: bottom line of each clef in scientific pitch (C-anchored)
const BOTTOM_BASE_DIATONIC_INDEX: Record<"treble" | "bass", number> = {
  treble: diatonicIndex(2, 4), // E4
  bass:   diatonicIndex(4, 2), // G2
};

type Band = { yTop: number; yBottom: number };

function yFromStep(step: number, bandTop: number, bandBottom: number): number {
  const spanPx = Math.max(1, bandBottom - bandTop);
  const pxPerStep = spanPx / STEP_TOP;
  // Linear, unbounded (enables infinite diatonic extension)
  return bandTop + (STEP_TOP - step) * pxPerStep;
}

/** Prefer exact melody-staff bounds from layout; otherwise fall back to a padded half. */
function topStaffBand(sys: SystemLayout): Band {
  const any: any = sys as any;
  if (Number.isFinite(any.melY0) && Number.isFinite(any.melY1)) {
    const y0 = Math.min(any.melY0 as number, any.melY1 as number);
    const y1 = Math.max(any.melY0 as number, any.melY1 as number);
    return { yTop: y0, yBottom: y1 };
  }

  // Fallback: estimate a top-staff band from total block
  const fullTop = sys.y0;
  const fullBottom = sys.y1;
  const fullH = Math.max(1, fullBottom - fullTop);
  if (fullH < TWO_STAVES_THRESHOLD) return { yTop: fullTop, yBottom: fullBottom };
  const staffH = Math.max(40, (fullH - STAFF_GAP_EST) / 2);
  return { yTop: fullTop, yBottom: Math.round(fullTop + staffH) };
}

/* ---------------- diatonic snap + tiny cents micro-offset ---------------- */
/** Map any MIDI (float) to an infinite diatonic ladder aligned to the clef’s staff. */
function yFromMidiOnStaff(
  midiFloat: number,
  bandTop: number,
  bandBottom: number,
  clef: "treble" | "bass",
  useSharps = true
): number {
  const nearest = Math.round(midiFloat);

  // Name & octave are scientific, C-anchored (so A3 really is A3, etc.)
  const { name, octave } = midiToNoteName(nearest, { useSharps, octaveAnchor: "C" });

  // Diatonic step relative to the clef’s bottom line (no folding!)
  const L = LETTER_TO_IDX[name[0] as keyof typeof LETTER_TO_IDX] ?? 0;
  const baseDiatonic = diatonicIndex(L, octave);
  const step = baseDiatonic - BOTTOM_BASE_DIATONIC_INDEX[clef];

  // Snap to the diatonic grid
  const ySnap = yFromStep(step, bandTop, bandBottom);

  // Add a small micro offset for cents so the dot moves within each step.
  const spanPx = Math.max(1, bandBottom - bandTop);
  const pxPerStep = spanPx / STEP_TOP;
  const cents = 100 * (midiFloat - nearest);
  const MICRO = 0.2; // ≤20% of a diatonic step
  const micro = Math.max(-1, Math.min(1, cents / 100)) * (pxPerStep * MICRO);

  // NOTE: we do NOT clamp to the staff band — this enables infinite extension.
  return ySnap - micro;
}

export default function SheetOverlay({
  width,
  height,
  phrase,
  running,
  startAtMs = null,
  leadInSec = 1.5,
  staffStartX = null,
  staffEndX = null,
  systems,
  livePitchHz = null,
  confidence = 0,
  confThreshold = 0.5,
  a4Hz = 440,

  clef = null,
  useSharps = true,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const dpr = useMemo(
    () => (typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1),
    []
  );

  const { minMidi, maxMidi } = useMemo(() => {
    if (!phrase?.notes?.length) return { minMidi: 54, maxMidi: 66 };
    const r = getMidiRange(phrase, 2);
    return { minMidi: r.minMidi, maxMidi: r.maxMidi };
  }, [phrase]);

  const totalSec = useMemo(() => {
    if (Array.isArray(systems) && systems.length) {
      return systems[systems.length - 1]!.endSec;
    }
    return Math.max(leadInSec + (phrase?.durationSec ?? 0), 0.001);
  }, [systems, leadInSec, phrase?.durationSec]);

  const shouldShowPitch =
    livePitchHz != null &&
    Number.isFinite(livePitchHz) &&
    (confidence ?? 0) >= (confThreshold ?? 0.5);

  const shouldAnimate = running || shouldShowPitch;

  const draw = useCallback(
    (nowMs: number) => {
      const cnv = canvasRef.current;
      if (!cnv) return;

      const wantW = Math.round(width * dpr);
      const wantH = Math.round(height * dpr);
      if (cnv.width !== wantW) cnv.width = wantW;
      if (cnv.height !== wantH) cnv.height = wantH;

      const ctx = cnv.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);

      const isLiveTransport = running && startAtMs != null;
      const tNow = isLiveTransport ? (nowMs - (startAtMs as number)) / 1000 : 0;
      const headTime = Math.max(0, Math.min(totalSec, tNow));

      // --- playhead & TOP staff band (use melY0/melY1 when present) ---
      let xGuide = 0.5;
      let band: Band = { yTop: 0, yBottom: height };

      if (Array.isArray(systems) && systems.length) {
        let sys = systems[0];
        for (let i = 0; i < systems.length; i++) {
          const s = systems[i];
          if (headTime >= s.startSec && headTime < s.endSec) { sys = s; break; }
          if (headTime >= s.endSec) sys = s;
        }

        if (Array.isArray(sys.segments) && sys.segments.length) {
          let seg = sys.segments[0];
          for (let i = 0; i < sys.segments.length; i++) {
            const s = sys.segments[i]!;
            if (headTime >= s.startSec && headTime < s.endSec) { seg = s; break; }
            if (headTime >= s.endSec) seg = s;
          }
          const dur = Math.max(1e-6, seg.endSec - seg.startSec);
          const u = Math.max(0, Math.min(1, (headTime - seg.startSec) / dur));
          xGuide = Math.round(seg.x0 + u * (seg.x1 - seg.x0)) + 0.5;
        } else {
          const dur = Math.max(1e-6, sys.endSec - sys.startSec);
          const u = (headTime - sys.startSec) / dur;
          xGuide = Math.round(sys.x0 + u * (sys.x1 - sys.x0)) + 0.5;
        }

        band = topStaffBand(sys);
      } else {
        // legacy layout
        const x0 = Number.isFinite(staffStartX as number) ? (staffStartX as number) : 0;
        const x1 = Number.isFinite(staffEndX as number) ? (staffEndX as number) : width;
        const bandW = Math.max(1, x1 - x0);
        const ratio = headTime / totalSec;
        xGuide = Math.round(x0 + ratio * bandW) + 0.5;
        band = { yTop: 0, yBottom: height };
      }

      // Playhead
      ctx.strokeStyle = "#22c55e";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(xGuide, band.yTop);
      ctx.lineTo(xGuide, band.yBottom);
      ctx.stroke();

      // Live pitch dot — melody staff ONLY (diatonic snap + cents micro)
      if (shouldShowPitch) {
        const rawMidi = hzToMidi(livePitchHz as number, a4Hz);
        if (Number.isFinite(rawMidi)) {
          // NO octave folding — map actual MIDI directly
          const yRaw = yFromMidiOnStaff(
            rawMidi,
            band.yTop,
            band.yBottom,
            (clef ?? "treble") as "treble" | "bass",
            !!useSharps
          );

          // Infinite extension — clamp only to canvas edges
          const DOT_R = 5;
          const yCanvas = Math.max(DOT_R, Math.min(height - DOT_R, yRaw));

          // Dot
          ctx.fillStyle = PR_COLORS.dotFill;
          ctx.beginPath();
          ctx.arc(xGuide, yCanvas, DOT_R, 0, Math.PI * 2);
          ctx.fill();
          ctx.lineWidth = 1.25;
          ctx.strokeStyle = PR_COLORS.dotStroke;
          ctx.stroke();

          // Overflow triangles ONLY when off the canvas
          const tri = 6;
          if (yRaw < -DOT_R) {
            ctx.beginPath();
            ctx.moveTo(xGuide, 3);
            ctx.lineTo(xGuide - tri, 3 + tri);
            ctx.lineTo(xGuide + tri, 3 + tri);
            ctx.closePath();
            ctx.fillStyle = PR_COLORS.dotFill;
            ctx.fill();
            ctx.strokeStyle = PR_COLORS.dotStroke;
            ctx.stroke();
          }
          if (yRaw > height + DOT_R) {
            ctx.beginPath();
            ctx.moveTo(xGuide, height - 3);
            ctx.lineTo(xGuide - tri, height - 3 - tri);
            ctx.lineTo(xGuide + tri, height - 3 - tri);
            ctx.closePath();
            ctx.fillStyle = PR_COLORS.dotFill;
            ctx.fill();
            ctx.strokeStyle = PR_COLORS.dotStroke;
            ctx.stroke();
          }
        }
      }
    },
    [
      width,
      height,
      dpr,
      running,
      startAtMs,
      totalSec,
      livePitchHz,
      confidence,
      confThreshold,
      a4Hz,
      minMidi,
      maxMidi,
      staffStartX,
      staffEndX,
      systems,
      shouldShowPitch,
      clef,
      useSharps,
    ]
  );

  const drawRef = useRef(draw);
  useEffect(() => { drawRef.current = draw; }, [draw]);

  useEffect(() => {
    if (shouldAnimate) {
      const step = (ts: number) => { drawRef.current(ts); rafRef.current = requestAnimationFrame(step); };
      rafRef.current = requestAnimationFrame(step);
    } else {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      drawRef.current(performance.now());
    }
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [shouldAnimate]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        width: `${width}px`,
        height: `${height}px`,
        position: "absolute",
        inset: 0,
        display: "block",
        pointerEvents: "none",
      }}
    />
  );
}

