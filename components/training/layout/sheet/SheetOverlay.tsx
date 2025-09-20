// components/training/layout/sheet/SheetOverlay.tsx
"use client";

import React, { useCallback, useEffect, useMemo, useRef } from "react";
import { PR_COLORS, midiToY, getMidiRange, type Phrase } from "@/utils/piano-roll/scale";
import { hzToMidi } from "@/utils/pitch/pitchMath";

/** NEW: describe per-system layout coming from VexScore */
type SystemLayout = {
  startSec: number; endSec: number;
  x0: number; x1: number;
  y0: number; y1: number;
};

type Props = {
  width: number;
  height: number;
  phrase: Phrase;
  running: boolean;
  startAtMs?: number | null;
  leadInSec?: number;

  /** Legacy single-row alignment (still supported) */
  staffStartX?: number | null;
  staffEndX?: number | null;

  /** NEW: multi-row layout (preferred if provided) */
  systems?: SystemLayout[];

  bpm: number;
  tsNum: number;
  den: number;

  livePitchHz?: number | null;
  confidence?: number;
  confThreshold?: number;
  a4Hz?: number;
};

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
  bpm,        // kept in props for future use if needed
  tsNum,      // ^
  den,        // ^
  livePitchHz = null,
  confidence = 0,
  confThreshold = 0.5,
  a4Hz = 440,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const dpr = useMemo(() => (typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1), []);

  const { minMidi, maxMidi } = useMemo(() => {
    if (!phrase?.notes?.length) return { minMidi: 54, maxMidi: 66 };
    const r = getMidiRange(phrase, 2);
    return { minMidi: r.minMidi, maxMidi: r.maxMidi };
  }, [phrase]);

  const totalSec = useMemo(
    () => Math.max(leadInSec + (phrase?.durationSec ?? 0), 0.001),
    [leadInSec, phrase?.durationSec]
  );

  const draw = useCallback((nowMs: number) => {
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

    const isLive = running && startAtMs != null;

    // (Removed) tempo/meter badge

    const tNow = isLive ? (nowMs - (startAtMs as number)) / 1000 : 0;
    const headTime = Math.max(0, Math.min(totalSec, tNow));

    // --- Compute playhead X (+ system Y span if provided) ---
    let xGuide = 0.5;
    let yTop = 0;
    let yBottom = height;

    if (Array.isArray(systems) && systems.length) {
      let sys = systems[0];
      for (let i = 0; i < systems.length; i++) {
        const s = systems[i];
        if (headTime >= s.startSec && headTime < s.endSec) { sys = s; break; }
        if (headTime >= s.endSec) sys = s;
      }
      const dur = Math.max(1e-6, sys.endSec - sys.startSec);
      const u = (headTime - sys.startSec) / dur;
      xGuide = Math.round(sys.x0 + u * (sys.x1 - sys.x0)) + 0.5;
      yTop = sys.y0;
      yBottom = sys.y1;
    } else {
      const x0 = Number.isFinite(staffStartX as number) ? (staffStartX as number) : 0;
      const x1 = Number.isFinite(staffEndX as number) ? (staffEndX as number) : width;
      const bandW = Math.max(1, x1 - x0);
      const ratio = headTime / totalSec;
      xGuide = Math.round(x0 + ratio * bandW) + 0.5;
      yTop = 0;
      yBottom = height;
    }

    // green playhead
    ctx.strokeStyle = "#22c55e";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(xGuide, yTop);
    ctx.lineTo(xGuide, yBottom);
    ctx.stroke();

    // live pitch dot (optional)
    if (isLive && livePitchHz && confidence! >= (confThreshold ?? 0.5)) {
      const midi = hzToMidi(livePitchHz, a4Hz);
      if (Number.isFinite(midi)) {
        const y = Math.max(yTop, Math.min(yBottom, midiToY(midi, height, minMidi, maxMidi)));
        ctx.fillStyle = PR_COLORS.dotFill;
        ctx.beginPath();
        ctx.arc(xGuide, y, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.lineWidth = 1.25;
        ctx.strokeStyle = PR_COLORS.dotStroke;
        ctx.stroke();
      }
    }
  }, [
    width, height, dpr, running, startAtMs, totalSec,
    livePitchHz, confidence, confThreshold, a4Hz, minMidi, maxMidi,
    staffStartX, staffEndX, systems
  ]);

  const drawRef = useRef(draw);
  useEffect(() => { drawRef.current = draw; }, [draw]);

  useEffect(() => {
    if (running) {
      const step = (ts: number) => { drawRef.current(ts); rafRef.current = requestAnimationFrame(step); };
      rafRef.current = requestAnimationFrame(step);
    } else {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      drawRef.current(performance.now());
    }
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); rafRef.current = null; };
  }, [running]);

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
