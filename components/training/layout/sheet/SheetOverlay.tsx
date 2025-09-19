// components/training/layout/sheet/SheetOverlay.tsx
"use client";

import React, { useCallback, useEffect, useMemo, useRef } from "react";
import { PR_COLORS, midiToY, midiCellRect, getMidiRange, type Phrase } from "@/utils/piano-roll/scale";
import { hzToMidi } from "@/utils/pitch/pitchMath";

type Props = {
  width: number;
  height: number;
  phrase: Phrase;
  running: boolean;

  /** Recorder anchor in ms (aligns visual time with audio engine) */
  startAtMs?: number | null;

  /** Pre-roll lead-in (sec) — reserves space before note 1 */
  leadInSec?: number;

  /** Static staff engraving band from VexScore (x coordinates) */
  staffStartX?: number | null;
  staffEndX?: number | null;

  /** Musical transport (badge only) */
  bpm: number;
  tsNum: number;
  den: number;

  /** Live pitch */
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
  bpm,
  tsNum,
  den,
  livePitchHz = null,
  confidence = 0,
  confThreshold = 0.5,
  a4Hz = 440,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const dpr = useMemo(() => (typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1), []);

  const { minMidi, maxMidi } = useMemo(() => {
    if (!phrase?.notes?.length) return { minMidi: 60 - 6, maxMidi: 60 + 6 };
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

    // retina backing store
    const wantW = Math.round(width * dpr);
    const wantH = Math.round(height * dpr);
    if (cnv.width !== wantW) cnv.width = wantW;
    if (cnv.height !== wantH) cnv.height = wantH;

    const ctx = cnv.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    const isLive = running && startAtMs != null;

    // ----- Tempo / meter badge (top-right) -----
    ctx.save();
    const badge = `${bpm} BPM • ${tsNum}/${den}`;
    ctx.font = "12px ui-sans-serif, system-ui, -apple-system, Segoe UI";
    const bw = ctx.measureText(badge).width + 10;
    const xBadge = width - bw - 8;
    const yBadge = 6;
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.fillRect(xBadge, yBadge, bw, 18);
    ctx.strokeStyle = "rgba(0,0,0,0.2)";
    ctx.strokeRect(xBadge + 0.5, yBadge + 0.5, bw - 1, 18 - 1);
    ctx.fillStyle = "#0f0f0f";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(badge, xBadge + 5, yBadge + 9);
    ctx.restore();

    // ----- Moving playhead ONLY (no dynamic beat/measure grid) -----
    const xBandStart = Number.isFinite(staffStartX as number) ? (staffStartX as number) : 0;
    const xBandEnd = Number.isFinite(staffEndX as number) ? (staffEndX as number) : width;
    const bandWidth = Math.max(1, xBandEnd - xBandStart);

    const tNow = isLive ? (nowMs - (startAtMs as number)) / 1000 : 0;
    const headTime = Math.max(0, Math.min(totalSec, tNow)); // clamp within staff duration
    const ratio = headTime / totalSec;
    const xGuide = Math.round(xBandStart + ratio * bandWidth) + 0.5;

    // Find active note's vertical band to draw a partial-height playhead
    let activeY = 0, activeH = height;
    for (let i = 0; i < phrase.notes.length; i++) {
      const n = phrase.notes[i];
      const nextStart = phrase.notes[i + 1]?.startSec ?? n.startSec + n.durSec;
      if (headTime >= n.startSec && headTime < nextStart) {
        const rect = midiCellRect(n.midi, height, minMidi, maxMidi);
        activeY = rect.y;
        activeH = Math.max(8, rect.h);
        break;
      }
    }

    // green playhead
    ctx.strokeStyle = "#22c55e";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(xGuide, activeY);
    ctx.lineTo(xGuide, activeY + activeH);
    ctx.stroke();

    // ----- Live pitch dot (optional) -----
    if (isLive && livePitchHz && confidence >= (confThreshold ?? 0.5)) {
      const midi = hzToMidi(livePitchHz, a4Hz);
      if (Number.isFinite(midi)) {
        const y = midiToY(midi, height, minMidi, maxMidi);
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
    width, height, dpr, phrase, running, startAtMs, leadInSec, totalSec,
    bpm, den, tsNum, livePitchHz, confidence, confThreshold, a4Hz, minMidi, maxMidi,
    staffStartX, staffEndX
  ]);

  // keep draw stable
  const drawRef = useRef(draw);
  useEffect(() => { drawRef.current = draw; }, [draw]);

  // RAF loop
  useEffect(() => {
    if (running) {
      const step = (ts: number) => { drawRef.current(ts); rafRef.current = requestAnimationFrame(step); };
      rafRef.current = requestAnimationFrame(step);
    } else {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      drawRef.current(performance.now()); // static frame
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
