// components/training/layout/piano-roll/RhythmRollCanvas.tsx
"use client";

import React, { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { PR_COLORS } from "@/utils/stage/scale";
import { noteValueToSeconds, type NoteValue } from "@/utils/time/tempo";
import type { RhythmEvent } from "@/utils/phrase/generator";

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

const BLUE = {
  fill: "#3b82f6", // blue-500
};
// Same blue with 25% opacity for tails
const BLUE_TAIL = "rgba(59,130,246,0.25)";

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
  const hostRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);

  const dpr = useMemo(
    () => (typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1),
    []
  );
  const [width, setWidth] = React.useState<number | null>(null);

  // measure width responsively
  useLayoutEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const measure = () => {
      const w = el.clientWidth || Math.round(el.getBoundingClientRect().width);
      if (w && w !== width) setWidth(w);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Precompute absolute starts/durations (seconds) from rhythm events
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

  // Constant: visual size of one sixteenth note (seconds)
  const sixteenthSec = useMemo(
    () => noteValueToSeconds("sixteenth", bpm, den),
    [bpm, den]
  );

  const draw = React.useCallback((nowMs: number) => {
    const W = width ?? 0;
    if (!W) return;
    const H = height;

    const cnv = canvasRef.current;
    if (!cnv) return;

    // ensure backing store matches CSS pixels
    const wantW = Math.round(W * dpr);
    const wantH = Math.round(H * dpr);
    if (cnv.width !== wantW) cnv.width = wantW;
    if (cnv.height !== wantH) cnv.height = wantH;

    const ctx = cnv.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // background
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = PR_COLORS.bg;
    ctx.fillRect(0, 0, W, H);

    // timeline math (same anchor logic as piano roll overlay)
    const anchorX = Math.max(0, Math.min(W * anchorRatio, W - 1));
    const pxPerSec = (W - anchorX) / Math.max(0.001, windowSec);
    const isLive = running && startAtMs != null;
    const tNow = isLive ? (nowMs - (startAtMs as number)) / 1000 : 0;
    const tView = tNow - (leadInSec ?? 0);

    // draw rhythm blocks (note = blue rect, rest = gap)
    const visLeft = -32, visRight = W + 32;
    const padY = 6;
    const laneY = padY;
    const laneH = Math.max(8, H - padY * 2);

    // precompute fixed sixteenth width in pixels for this frame
    const sixteenthPx = Math.max(0, sixteenthSec * pxPerSec);

    for (const seg of items) {
      if (!seg.isNote) continue; // rests render as gaps

      // Position & size
      const x = anchorX + (seg.t0 - tView) * pxPerSec;
      const noteDurSec = seg.t1 - seg.t0;
      const w = Math.max(1, noteDurSec * pxPerSec);
      if (x + w < visLeft || x > visRight) continue;

      const rx = Math.round(x);
      const ry = Math.round(laneY);
      const rh = Math.round(laneH);
      const rw = Math.round(w);

      // Shorter-than-sixteenth: solid full-opacity block (no split)
      if (noteDurSec < sixteenthSec - 1e-6) {
        ctx.fillStyle = BLUE.fill;
        ctx.fillRect(rx, ry, rw, rh);
        continue;
      }

      // Split at exactly one sixteenth note (musically pure) — gradient head, flat tail
      const leadW = Math.max(1, Math.min(rw, Math.round(sixteenthPx)));
      const tailW = rw - leadW;

      // 1) LEAD gradient 100% → 25%
      const grad = ctx.createLinearGradient(rx, 0, rx + leadW, 0);
      grad.addColorStop(0, BLUE.fill);
      grad.addColorStop(1, BLUE_TAIL);
      ctx.fillStyle = grad;
      ctx.fillRect(rx, ry, leadW, rh);

      // 2) TAIL at 25% opacity
      if (tailW > 0) {
        ctx.fillStyle = BLUE_TAIL;
        ctx.fillRect(rx + leadW, ry, tailW, rh);
      }
      // No stroke on notes to avoid seams where adjacent notes touch.
    }

    // playhead dot (always visible)
    const DOT_R = 6;
    const xGuide = anchorX;
    const yCenter = laneY + laneH / 2;
    ctx.fillStyle = PR_COLORS.dotFill;
    ctx.beginPath();
    ctx.arc(xGuide, yCenter, DOT_R, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 1.25;
    ctx.strokeStyle = PR_COLORS.dotStroke;
    ctx.stroke();

    // container border only
    ctx.strokeStyle = PR_COLORS.gridMajor;
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, W - 1, H - 1);
  }, [width, height, dpr, items, running, startAtMs, leadInSec, windowSec, anchorRatio, sixteenthSec]);

  const drawRef = useRef(draw);
  useEffect(() => {
    drawRef.current = draw;
  }, [draw]);

  useEffect(() => {
    if (!width) return;
    if (running) {
      const step = (ts: number) => {
        drawRef.current(ts);
        rafRef.current = requestAnimationFrame(step);
      };
      rafRef.current = requestAnimationFrame(step);
    } else {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      drawRef.current(performance.now()); // static frame
    }
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [running, width]);

  // reserve height even if no rhythm yet
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
