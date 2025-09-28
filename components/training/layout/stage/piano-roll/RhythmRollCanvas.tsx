// components/training/layout/stage/piano-roll/RhythmRollCanvas.tsx
"use client";
import React, { useMemo, useRef, useEffect, useCallback } from "react";
import { PR_COLORS } from "@/utils/stage";
import { noteValueToSeconds, type NoteValue } from "@/utils/time/tempo";
import type { RhythmEvent } from "@/utils/phrase/generator";
import useMeasuredWidth from "./rhythm/hooks/useMeasuredWidth";
import useDpr from "./rhythm/hooks/useDpr";
import useRafLoop from "./rhythm/hooks/useRafLoop";
import { ensureCanvas2d } from "./rhythm/utils/canvas";
import { computeAnchorAndScale } from "./rhythm/utils/timeline";
import { drawAll } from "./rhythm/utils/draw";

type Props = {
  height: number;
  rhythm: RhythmEvent[] | null;
  running: boolean;
  startAtMs?: number | null;
  leadInSec?: number;
  windowSec?: number;
  anchorRatio?: number;
  bpm: number;
  den: number;
};

type BitmapLike = ImageBitmap | HTMLCanvasElement;
const MAX_RHYTHM_BITMAP_PX = 4096;

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

  const sixteenthSec = useMemo(() => noteValueToSeconds("sixteenth", bpm, den), [bpm, den]);

  // Cached pre-render of the blue blocks in time space
  const laneBmpRef = useRef<BitmapLike | null>(null);
  const laneBmpWRef = useRef<number>(0); // CSS-px width (not device px)
  const disposeBitmap = (bmp: BitmapLike | null) => {
    if (!bmp) return;
    // @ts-ignore
    if (typeof (bmp as any).close === "function") (bmp as any).close();
  };

  const buildCanvas = (w: number, h: number) => {
    const c = document.createElement("canvas");
    c.width = Math.round(w * dpr);
    c.height = Math.round(h * dpr);
    const ctx = c.getContext("2d");
    if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0); // draw in CSS px
    return c;
  };
  const toBitmap = async (c: HTMLCanvasElement): Promise<BitmapLike> => {
    // @ts-ignore
    if (typeof createImageBitmap === "function") {
      try {
        return await createImageBitmap(c);
      } catch {}
    }
    return c; // fallback: use canvas directly
  };

  // Pre-render lane when width/tempo/rhythm change
  useEffect(() => {
    disposeBitmap(laneBmpRef.current);
    laneBmpRef.current = null;
    laneBmpWRef.current = 0;
    if (!width || !height || !items.length) return;

    // Build using current pxPerSec so we can blit with translation
    const { pxPerSec } = computeAnchorAndScale(width, windowSec, anchorRatio);

    const totalSec = items.length ? items[items.length - 1].t1 : 0;
    const totalW = Math.ceil(totalSec * pxPerSec); // CSS px width
    if (totalW <= 0 || totalW > MAX_RHYTHM_BITMAP_PX) return;

    const padY = 6;
    const laneY = padY;
    const laneH = Math.max(8, height - padY * 2);
    const sixteenthPx = Math.max(0, sixteenthSec * pxPerSec);

    const c = buildCanvas(totalW, height);
    const ctx = c.getContext("2d")!;

    const BLUE = { fill: "#3b82f6" };
    const BLUE_TAIL = "rgba(59,130,246,0.25)";

    for (const seg of items) {
      if (!seg.isNote) continue;
      const x = Math.round(seg.t0 * pxPerSec);
      const noteDurSec = seg.t1 - seg.t0;
      const w = Math.max(1, Math.round(noteDurSec * pxPerSec));

      const rx = x;
      const ry = Math.round(laneY);
      const rh = Math.round(laneH);
      const rw = w;

      if (noteDurSec < sixteenthSec - 1e-6) {
        ctx.fillStyle = BLUE.fill;
        ctx.fillRect(rx, ry, rw, rh);
      } else {
        const leadW = Math.max(1, Math.min(rw, Math.round(sixteenthPx)));
        const tailW = rw - leadW;

        const grad = ctx.createLinearGradient(rx, 0, rx + leadW, 0);
        grad.addColorStop(0, BLUE.fill);
        grad.addColorStop(1, BLUE_TAIL);
        ctx.fillStyle = grad;
        ctx.fillRect(rx, ry, leadW, rh);

        if (tailW > 0) {
          ctx.fillStyle = BLUE_TAIL;
          ctx.fillRect(rx + leadW, ry, tailW, rh);
        }
      }
    }

    void toBitmap(c).then((bmp) => {
      laneBmpRef.current = bmp;
      laneBmpWRef.current = totalW; // keep CSS-px width
    });

    return () => disposeBitmap(laneBmpRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, width, height, windowSec, anchorRatio, sixteenthSec, dpr]);

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

      // bg
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = PR_COLORS.bg;
      ctx.fillRect(0, 0, width, height);

      // pre-rendered lane (blit with translation) — IMPORTANT: draw with DEST width/height in CSS px
      const bmp = laneBmpRef.current;
      const bmpW = laneBmpWRef.current; // CSS px width we baked for
      const offsetX = Math.round(anchorX - tView * pxPerSec);
      if (bmp && bmpW > 0) {
        ctx.drawImage(bmp as any, offsetX, 0, bmpW, height);
      } else {
        // fallback: draw on the fly (matching rounding path)
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
        return;
      }

      // playhead + border (crisp)
      const DOT_R = 6;
      const xGuide = Math.round(anchorX) + 0.5;
      const padY = 6;
      const laneY = padY;
      const laneH = Math.max(8, height - padY * 2);
      const yCenter = laneY + laneH / 2;
      ctx.fillStyle = PR_COLORS.dotFill;
      ctx.beginPath();
      ctx.arc(xGuide, yCenter, DOT_R, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = 1.25;
      ctx.strokeStyle = PR_COLORS.dotStroke;
      ctx.stroke();
    },
    [width, height, dpr, items, running, startAtMs, leadInSec, windowSec, anchorRatio, sixteenthSec]
  );

  const drawRef = useRef(draw);
  useEffect(() => {
    drawRef.current = draw;
  }, [draw]);

  useRafLoop({
    running: running && !!width && startAtMs != null,
    onFrame: (ts: number) => drawRef.current(ts),
    onStart: () => {
      if (width) drawRef.current(performance.now());
    },
    onStop: () => {
      if (!width) return;
      drawRef.current(performance.now());
    },
  });

  useEffect(() => {
    if (running && startAtMs == null && width) {
      drawRef.current(performance.now());
    }
  }, [running, startAtMs, width]);

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
