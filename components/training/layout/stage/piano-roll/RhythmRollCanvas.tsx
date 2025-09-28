// components/training/layout/stage/piano-roll/RhythmRollCanvas.tsx
"use client";
import React, { useMemo, useRef, useEffect, useCallback } from "react";
import { PR_COLORS } from "@/utils/stage";
import { noteValueToSeconds, type NoteValue } from "@/utils/time/tempo";
import type { RhythmEvent } from "@/utils/phrase/generator";
// hooks
import useMeasuredWidth from "./rhythm/hooks/useMeasuredWidth";
import useDpr from "./rhythm/hooks/useDpr";
import useRafLoop from "./rhythm/hooks/useRafLoop";
// utils
import { ensureCanvas2d } from "./rhythm/utils/canvas";
import { computeAnchorAndScale } from "./rhythm/utils/timeline";
import { drawAll } from "./rhythm/utils/draw";
type Props = {
  /** height in CSS px */
  height: number;
  /** rhythm events to render (notes = blue blocks, rests = gaps) */
  rhythm: RhythmEvent[] | null;
  /** scroll/anchor control (shared with piano roll overlay) */
  running: boolean;
  startAtMs?: number | null;
  leadInSec?: number;
  windowSec?: number;
  anchorRatio?: number;
  /** tempo */
  bpm: number;
  den: number;
};
export default function RhythmRollCanvas({
  height,
  rhythm,
  running,
  startAtMs = null,
  leadInSec = 1.5,
  windowSec = 4,
  anchorRatio = 0.1,
  bpm,
  den,
}: Props) {
  const { hostRef, width } = useMeasuredWidth();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const dpr = useDpr();
  // Precompute absolute starts/durations (seconds)
  const items = useMemo(() => {
    if (!rhythm || !rhythm.length) return [] as Array<{ t0: number; t1: number; isNote: boolean }>;
    const out: Array<{ t0: number; t1: number; isNote: boolean }> = [];
    let t = 0;
    for (const ev of rhythm) {
      const dur = noteValueToSeconds(ev.value as NoteValue, bpm, den);
      const t0 = t;
      const t1 = t + dur;
      out.push({ t0, t1, isNote: ev.type === "note" });
      t = t1;
    }
    return out;
  }, [rhythm, bpm, den]);
  // Sixteenth duration (seconds) — fixed visual reference
  const sixteenthSec = useMemo(() => noteValueToSeconds("sixteenth", bpm, den), [bpm, den]);
  const draw = useCallback(
    (nowMs: number) => {
      if (!width) return;
      const cnv = canvasRef.current;
      if (!cnv) return;
      const ctx = ensureCanvas2d(cnv, width, height, dpr);
      if (!ctx) return;
      const { anchorX, pxPerSec } = computeAnchorAndScale(width, windowSec, anchorRatio);
      const isLive = running && startAtMs != null;
      const tNow = isLive ? Math.max(0, (nowMs - (startAtMs as number)) / 1000) : 0;
      const tView = tNow - (leadInSec ?? 0);
      drawAll({
        ctx,
        width,
        height,
        anchorX,
        pxPerSec,
        tView,
        items,
        sixteenthSec,
      });
    },
    [width, height, dpr, items, running, startAtMs, leadInSec, windowSec, anchorRatio, sixteenthSec]
  );
  const drawRef = useRef(draw);
  useEffect(() => {
    drawRef.current = draw;
  }, [draw]);
  useRafLoop({
    running: running && !!width,
    onFrame: (ts: number) => drawRef.current(ts),
    onStop: () => {
      if (!width) return;
      drawRef.current(performance.now());
    },
  });
  return (
    <div ref={hostRef} className="relative w-full" style={{ height }}>
      {width && width > 4 ? (
        <canvas
          ref={canvasRef}
          style={{
            width: `${width}px`,
            height: `${height}px`,
            display: "block",
            position: "absolute",
            inset: 0,
          }}
        />
      ) : null}
    </div>
  );
}