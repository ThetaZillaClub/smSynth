// components/training/layout/stage/piano-roll/DynamicOverlay.tsx
"use client";
import React, { useEffect, useRef, useCallback } from "react";
import {
  clamp,
  midiToY,
  midiToYCenter,
  midiCellRect,
  PR_COLORS,
  type Phrase,
} from "@/utils/stage";
import { hzToMidi, midiToNoteName } from "@/utils/pitch/pitchMath";
import useRafLoop from "./rhythm/hooks/useRafLoop";
import useDpr from "./rhythm/hooks/useDpr";

type Props = {
  width: number;
  height: number;
  phrase: Phrase;
  running: boolean;
  onActiveNoteChange?: (idx: number) => void;
  minMidi: number;
  maxMidi: number;
  windowSec?: number;
  anchorRatio?: number;
  livePitchHz?: number | null;
  confidence?: number;
  confThreshold?: number;
  a4Hz?: number;
  leadInSec?: number;
  startAtMs?: number | null;
  lyrics?: string[];
  /** Tonic pitch class 0..11; controls bottom row + heavy grid lines. */
  tonicPc?: number;
  /** Enharmonic preference for labels (true=sharps, false=flats). */
  useSharps?: boolean;

  /** Visual toggles */
  /** Draw note rectangles at all (ignores lyrics if false). Default: true */
  showNoteBlocks?: boolean;
  /** Draw a 1px border on note rectangles. Default: true */
  showNoteBorders?: boolean;
  /** If lyrics are present, still draw blocks behind the text. Default: false */
  blocksWhenLyrics?: boolean;
};

type BitmapLike = ImageBitmap | HTMLCanvasElement;

export default function DynamicOverlay({
  width,
  height,
  phrase,
  running,
  onActiveNoteChange,
  minMidi,
  maxMidi,
  windowSec = 4,
  anchorRatio = 0.1,
  livePitchHz = null,
  confidence = 0,
  confThreshold = 0.5,
  a4Hz = 440,
  leadInSec = 1.5,
  startAtMs = null,
  lyrics,
  tonicPc = 0,
  useSharps = false, // default to flats unless caller opts into sharps
  showNoteBlocks = true,
  showNoteBorders = true,
  blocksWhenLyrics = true,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Prepare drawRef *early* so builders can poke it.
  const drawRef = useRef<(ts: number) => void>(() => {});

  // Transport smoothing
  const wasLiveRef = useRef<boolean>(false);
  const smoothNowSecRef = useRef<number>(0);
  const lastFrameMsRef = useRef<number | null>(null);
  const liveBecameRef = useRef<number | null>(null);
  const prevStartAtRef = useRef<number | null>(null);
  const SMOOTH_TAU_MS = 45;
  const SMOOTH_WINDOW_MS = 90;

  const lastActiveRef = useRef<number>(-1);
  const pointsRef = useRef<Array<{ t: number; midi: number }>>([]);
  const dpr = useDpr();
  const lastYRef = useRef<number | null>(null);

  // ----- Cached grid bitmap -----
  const gridBmpRef = useRef<BitmapLike | null>(null);
  const gridKeyRef = useRef<string>("");

  // (1) Thorough paint reset: shadow, alpha, composite, and filter
  const resetPaint = (ctx: CanvasRenderingContext2D) => {
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    ctx.shadowColor = "rgba(0,0,0,0)";
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
    // @ts-ignore
    ctx.filter = "none";
  };

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
    if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return c;
  };

  const toBitmap = async (c: HTMLCanvasElement): Promise<BitmapLike> => {
    // @ts-ignore
    if (typeof createImageBitmap === "function") {
      try {
        return await createImageBitmap(c);
      } catch {}
    }
    return c;
  };

  const rebuildGridIfNeeded = useCallback(async () => {
    const key = `${width}x${height}:${minMidi}-${maxMidi}:pc${tonicPc}:shp${useSharps ? 1 : 0}:dpr${dpr}`;
    if (!width || !height) return;
    if (gridKeyRef.current === key && gridBmpRef.current) return;

    disposeBitmap(gridBmpRef.current);
    gridBmpRef.current = null;
    gridKeyRef.current = key;

    const c = buildCanvas(width, height);
    const ctx = c.getContext("2d");
    if (!ctx) return;

    resetPaint(ctx);

    // bg
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = PR_COLORS.bg;
    ctx.fillRect(0, 0, width, height);

    // grid + labels
    const span = maxMidi - minMidi;
    for (let i = 0; i <= span; i++) {
      const midi = minMidi + i;
      const yLine = midiToY(midi, height, minMidi, maxMidi);
      const isTonic = ((midi - tonicPc) % 12 + 12) % 12 === 0;
      ctx.strokeStyle = isTonic ? PR_COLORS.gridMajor : PR_COLORS.gridMinor;
      ctx.lineWidth = isTonic ? 1.25 : 0.75;
      ctx.beginPath();
      ctx.moveTo(0, yLine);
      ctx.lineTo(width, yLine);
      ctx.stroke();

     // Draw labels only for actual cells (skip top boundary row)
     if (midi < maxMidi) {
       const { y, h } = midiCellRect(midi, height, minMidi, maxMidi);
       const centerY = y + h / 2;
       ctx.fillStyle = PR_COLORS.label;
       ctx.font = "13px ui-sans-serif, system-ui, -apple-system, Segoe UI";
       ctx.textAlign = "left";
       ctx.textBaseline = "middle";
       const { name, octave } = midiToNoteName(midi, { useSharps, octaveAnchor: "C" });
       ctx.fillText(`${name}${octave}`, 4, centerY);
     }
    }

    gridBmpRef.current = await toBitmap(c);

    // draw immediately even if idle
    requestAnimationFrame(() => {
      try {
        drawRef.current(performance.now());
      } catch {}
    });
  }, [width, height, minMidi, maxMidi, tonicPc, useSharps, dpr]);

  useEffect(() => {
    void rebuildGridIfNeeded();
  }, [rebuildGridIfNeeded]);

  useEffect(() => {
    return () => {
      disposeBitmap(gridBmpRef.current);
      gridBmpRef.current = null;
      gridKeyRef.current = "";
    };
  }, []);

  const easeInOutCirc = (u: number) => {
    const x = clamp(u, 0, 1);
    if (x < 0.5) {
      const z = 1 - (2 * x) * (2 * x);
      return (1 - Math.sqrt(Math.max(0, z))) / 2;
    }
    const y = -2 * x + 2;
    const z = 1 - y * y;
    return (Math.sqrt(Math.max(0, z)) + 1) / 2;
  };

  const draw = useCallback(
    (nowMs: number) => {
      const cnv = canvasRef.current;
      if (!cnv) return;

      // Backing store resolution
      const wantW = Math.round(width * dpr);
      const wantH = Math.round(height * dpr);
      if (cnv.width !== wantW) cnv.width = wantW;
      if (cnv.height !== wantH) cnv.height = wantH;

      const ctx = cnv.getContext("2d");
      if (!ctx) return;

      // (2) Clear in device pixels with identity, then apply CSS-px transform
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, cnv.width, cnv.height);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      resetPaint(ctx); // ensure clean state for this frame

      // Time base
      const isLive = running && startAtMs != null;
      const rawNowSec = isLive ? Math.max(0, (nowMs - (startAtMs as number)) / 1000) : 0;

      if (isLive && !wasLiveRef.current) {
        liveBecameRef.current = nowMs;
        smoothNowSecRef.current = rawNowSec;
      } else if (!isLive) {
        liveBecameRef.current = null;
        smoothNowSecRef.current = 0;
      }

      if (isLive && startAtMs !== prevStartAtRef.current) {
        prevStartAtRef.current = startAtMs;
        liveBecameRef.current = nowMs;
        smoothNowSecRef.current = rawNowSec;
      }
      wasLiveRef.current = isLive;

      const lastMs = lastFrameMsRef.current ?? nowMs;
      const dt = Math.max(0, nowMs - lastMs);
      lastFrameMsRef.current = nowMs;

      let tNowSec: number;
      if (isLive && liveBecameRef.current != null && nowMs - liveBecameRef.current < SMOOTH_WINDOW_MS) {
        const alpha = 1 - Math.exp(-dt / SMOOTH_TAU_MS);
        smoothNowSecRef.current += (rawNowSec - smoothNowSecRef.current) * alpha;
        tNowSec = smoothNowSecRef.current;
      } else {
        tNowSec = rawNowSec;
        smoothNowSecRef.current = rawNowSec;
      }

      const anchorX = Math.max(0, Math.min(width * anchorRatio, width - 1));
      const pxPerSec = (width - anchorX) / Math.max(0.001, windowSec);

      const tView = tNowSec - leadInSec;
      const baseX = Math.round(anchorX - tView * pxPerSec);

      // Background (grid prerender if present)
      const grid = gridBmpRef.current;
      if (grid) {
        try {
          ctx.drawImage(grid as any, 0, 0, width, height);
        } catch {
          disposeBitmap(gridBmpRef.current);
          gridBmpRef.current = null;
          ctx.fillStyle = PR_COLORS.bg;
          ctx.fillRect(0, 0, width, height);
        }
      } else {
        ctx.fillStyle = PR_COLORS.bg;
        ctx.fillRect(0, 0, width, height);
      }

      // Notes
      const visLeft = -64,
        visRight = width + 64;

      for (let i = 0; i < phrase.notes.length; i++) {
        const n = phrase.notes[i];

        const rxInt = baseX + Math.round(n.startSec * pxPerSec);
        const drawW = Math.max(2, Math.round(n.durSec * pxPerSec));
        if (rxInt + drawW < visLeft || rxInt > visRight) continue;

        const { y, h } = midiCellRect(n.midi, height, minMidi, maxMidi);

        const rx = rxInt;
        const ry = Math.round(y);
        const rh = Math.round(h);

        const hasLyrics = !!(lyrics && lyrics.length);
        const wantBlocks = showNoteBlocks && (!hasLyrics || blocksWhenLyrics);

        if (wantBlocks) {
          ctx.fillStyle = PR_COLORS.noteFill;
          ctx.fillRect(rx, ry, drawW, rh);
          if (showNoteBorders) {
            ctx.strokeStyle = PR_COLORS.noteStroke;
            ctx.lineWidth = 1;
            ctx.strokeRect(rx + 0.5, ry + 0.5, drawW, rh);
          }
        }

        if (drawW >= 24 && h >= 14) {
          const { name, octave } = midiToNoteName(n.midi, { useSharps, octaveAnchor: "C" });
          const word = lyrics?.[i];
          const paddingX = 4;
          const available = Math.max(0, drawW - paddingX * 2);
          if (available >= 18) {
            const noteLabel = `${name}${octave}`;
            // (3) Draw text with isolated state + explicit paint reset
            ctx.save();
            resetPaint(ctx);
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillStyle = "rgba(255,255,255,1)";
            const text = word ?? noteLabel;
            const cy = ry + rh / 2;
            ctx.font = `${word ? "700 " : ""}${Math.min(
              36,
              Math.max(12, Math.floor(rh * 0.52))
            )}px ui-sans-serif, system-ui, -apple-system, Segoe UI`;
            ctx.fillText(text, rx + drawW / 2, cy);
            ctx.restore();
          }
        }
      }

      // Live pitch trace
      if (isLive && pointsRef.current.length > 1) {
        ctx.lineWidth = 2;
        ctx.strokeStyle = PR_COLORS.trace;
        ctx.beginPath();
        let pen = false;
        let lastX: number | null = null;
        for (const p of pointsRef.current) {
          const x = baseX + Math.round(p.t * pxPerSec);
          if (x < visLeft - 64 || x > visRight + 64) continue;
          if (lastX !== null && x === lastX) continue;
          lastX = x;
          const y = midiToY(p.midi, height, minMidi, maxMidi);
          if (!pen) {
            ctx.moveTo(x, y);
            pen = true;
          } else {
            ctx.lineTo(x, y);
          }
        }
        if (pen) ctx.stroke();
      }

      // Playhead dot
      const DOT_RADIUS = 7;
      const xGuide = Math.round(anchorX) + 0.5;

      const drawDotAtY = (y: number) => {
        lastYRef.current = y;
        ctx.fillStyle = PR_COLORS.dotFill;
        ctx.beginPath();
        ctx.arc(xGuide, y, DOT_RADIUS, 0, Math.PI * 2);
        ctx.fill();
        ctx.lineWidth = 1.25;
        ctx.strokeStyle = PR_COLORS.dotStroke;
        ctx.stroke();
      };

      if (phrase.notes.length) {
        // active segment
        let segIdx = -1;
        for (let i = 0; i < phrase.notes.length; i++) {
          const s0 = phrase.notes[i].startSec;
          const s1 = phrase.notes[i + 1]?.startSec ?? Infinity;
          if (tView >= s0 && tView < s1) {
            segIdx = i;
            break;
          }
        }

        if (segIdx !== lastActiveRef.current) {
          lastActiveRef.current = segIdx;
          if (segIdx >= 0) onActiveNoteChange?.(segIdx);
        }

        let i = segIdx;
        if (i < 0) i = 0;
        if (i >= phrase.notes.length) i = phrase.notes.length - 1;

        const cur = phrase.notes[i];
        const nxt = phrase.notes[i + 1] ?? cur;

        const denom = Math.max(0.001, nxt.startSec - cur.startSec);
        const uRaw = (tView - cur.startSec) / denom;
        const u = easeInOutCirc(clamp(uRaw, 0, 1));

        const yStart = midiToYCenter(cur.midi, height, minMidi, maxMidi);
        const yEnd = midiToYCenter(nxt.midi, height, minMidi, maxMidi);
        const yGuide = yStart + (yEnd - yStart) * u;

        drawDotAtY(yGuide);
      } else {
        drawDotAtY(height / 2);
      }
    },
    [
      width,
      height,
      phrase,
      running,
      minMidi,
      maxMidi,
      windowSec,
      anchorRatio,
      leadInSec,
      startAtMs,
      dpr,
      lyrics,
      onActiveNoteChange,
      useSharps, // relabels if enharmonics switch
      showNoteBlocks,
      showNoteBorders,
      blocksWhenLyrics,
    ]
  );

  // keep draw stable across renders
  useEffect(() => {
    drawRef.current = draw;
  }, [draw]);

  // RAF loop — run only when truly live
  useRafLoop({
    running: running && startAtMs != null,
    onFrame: (ts: number) => drawRef.current(ts),
    onStart: () => {
      drawRef.current(performance.now());
    },
    onStop: () => {
      drawRef.current(performance.now());
    },
  });

  // When transport is armed but not started yet, draw a static frame
  useEffect(() => {
    if (running && startAtMs == null) {
      drawRef.current(performance.now());
    }
  }, [running, startAtMs]);

  // Also draw once on key input changes while idle
  useEffect(() => {
    drawRef.current(performance.now());
  }, [
    width,
    height,
    minMidi,
    maxMidi,
    phrase,
    lyrics,
    useSharps,
    showNoteBlocks,
    showNoteBorders,
    blocksWhenLyrics,
  ]);

  // Append live pitch samples only when truly "live"
  useEffect(() => {
    const isLive = running && startAtMs != null;
    if (!isLive) return;
    if (!livePitchHz || confidence < (confThreshold ?? 0.5)) return;

    const nowSec = (performance.now() - (startAtMs as number)) / 1000;
    const tPhrase = nowSec - (leadInSec ?? 0);
    const midi = hzToMidi(livePitchHz, a4Hz);
    if (!isFinite(midi)) return;

    pointsRef.current.push({ t: tPhrase, midi });

    const head = tPhrase;
    const keepFrom = head - windowSec * 1.5;
    if (pointsRef.current.length > 2000) {
      pointsRef.current = pointsRef.current.filter((p) => p.t >= keepFrom);
    }
  }, [
    running,
    livePitchHz,
    confidence,
    confThreshold,
    a4Hz,
    windowSec,
    startAtMs,
    leadInSec,
  ]);

  // Clear pitch points when startAtMs changes
  useEffect(() => {
    pointsRef.current = [];
  }, [startAtMs]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        filter: "none",
        width: `${width}px`,
        height: `${height}px`,
        display: "block",
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        zIndex: 2,
      }}
    />
  );
}
