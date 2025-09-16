// components/piano-roll/DynamicOverlay.tsx
"use client";

import React, { useEffect, useRef, useCallback, useMemo } from "react";
import { clamp, midiToY, midiToYCenter, midiCellRect, PR_COLORS } from "@/utils/piano-roll/scale";
import { hzToMidi, midiToNoteName } from "@/utils/pitch/pitchMath";
import type { Phrase } from "@/utils/piano-roll/types";

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

  /** Pre-roll lead-in duration (seconds) */
  leadInSec?: number;

  /** Recorder anchor in ms; when provided, overlay time is (now - startAtMs) */
  startAtMs?: number | null;

  /** Optional lyric words aligned 1:1 with phrase.notes (word i → note i) */
  lyrics?: string[];
};

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
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);

  // Fallback baseline used only for preview/static draws
  const startRef = useRef<number | null>(null);

  const lastActiveRef = useRef<number>(-1);
  const pointsRef = useRef<Array<{ t: number; midi: number }>>([]);

  const dpr = useMemo(() => (typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1), []);

  // 12px-width cache (reduces measureText churn)
  const width12CacheRef = useRef<Map<string, number>>(new Map());
  const getWidth12 = useCallback((ctx: CanvasRenderingContext2D, text: string, bold = false) => {
    const key = (bold ? "b|" : "n|") + text;
    const cached = width12CacheRef.current.get(key);
    if (cached != null) return cached;
    ctx.font = `${bold ? "700 " : ""}12px ui-sans-serif, system-ui, -apple-system, Segoe UI`;
    const w = ctx.measureText(text).width;
    width12CacheRef.current.set(key, w);
    return w;
  }, []);

  const draw = useCallback(
    (nowMs: number) => {
      const cnv = canvasRef.current;
      if (!cnv) return;

      // Ensure backing store matches CSS pixels
      const wantW = Math.round(width * dpr);
      const wantH = Math.round(height * dpr);
      if (cnv.width !== wantW) cnv.width = wantW;
      if (cnv.height !== wantH) cnv.height = wantH;

      const ctx = cnv.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // ----- Time base -----
      // "Live" only when we're running AND have a real recorder anchor.
      const isLive = running && startAtMs != null;

      const anchorX = Math.max(0, Math.min(width * anchorRatio, width - 1));
      const pxPerSec = (width - anchorX) / Math.max(0.001, windowSec);

      // For the brief gap before startAtMs arrives, freeze tNow=0 (no scroll).
      const tNow = isLive ? (nowMs - (startAtMs as number)) / 1000 : 0;
      const tView = tNow - leadInSec;
      const headTime = tView;

      // ----- Clear + BG -----
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = PR_COLORS.bg;
      ctx.fillRect(0, 0, width, height);

      // ----- Grid -----
      const span = maxMidi - minMidi;
      for (let i = 0; i <= span; i++) {
        const midi = minMidi + i;
        const yLine = midiToY(midi, height, minMidi, maxMidi);
        const isC = midi % 12 === 0;
        ctx.strokeStyle = isC ? PR_COLORS.gridMajor : PR_COLORS.gridMinor;
        ctx.lineWidth = isC ? 1.25 : 0.75;
        ctx.beginPath();
        ctx.moveTo(0, yLine);
        ctx.lineTo(width, yLine);
        ctx.stroke();

        if (isC) {
          const { y, h } = midiCellRect(midi, height, minMidi, maxMidi);
          const centerY = y + h / 2;
          ctx.fillStyle = PR_COLORS.label;
          ctx.font = "11px ui-sans-serif, system-ui, -apple-system, Segoe UI";
          ctx.textAlign = "left";
          ctx.textBaseline = "middle";
          const { octave } = midiToNoteName(midi, { useSharps: true, octaveAnchor: "A" });
          ctx.fillText(`C${octave}`, 4, centerY);
        }
      }

      // Text helper
      const drawInlineWordAndNote = (
        x: number,
        y: number,
        w: number,
        h: number,
        word: string | undefined,
        noteLabel: string
      ) => {
        const paddingX = 4;
        const available = Math.max(0, w - paddingX * 2);
        if (available < 18 || h < 12) return;

        const wordPx = Math.min(36, Math.max(12, Math.floor(h * 0.52)));
        const notePx = Math.min(12, Math.max(10, Math.floor(h * 0.40)));

        const wordW12 = word ? getWidth12(ctx, word, true) : 0;
        const noteW12 = getWidth12(ctx, noteLabel, false);
        const wWord = (wordW12 * wordPx) / 12;
        const wNote = (noteW12 * notePx) / 12;

        const gap = 6;
        const cx = x + w / 2;
        const cy = y + h / 2;

        ctx.textAlign = "left";
        ctx.textBaseline = "middle";

        const canShowBoth = word ? wWord + gap + wNote <= available : wNote <= available;

        let lyricStr = word ?? "";
        let wLyric = wWord;
        if (lyricStr && !canShowBoth && wWord > available) {
          const avgChar = Math.max(1, wordW12 / Math.max(1, lyricStr.length));
          const maxChars = Math.max(1, Math.floor((available * 12) / (avgChar * wordPx)) - 1);
          lyricStr = lyricStr.slice(0, maxChars) + "…";
          const ell12 = getWidth12(ctx, lyricStr, true);
          wLyric = (ell12 * wordPx) / 12;
        }

        const total = lyricStr ? (canShowBoth ? wLyric + gap + (wNote <= available ? wNote : 0) : wLyric) : wNote;
        const startX = cx - total / 2;

        if (lyricStr) {
          ctx.font = `700 ${wordPx}px ui-sans-serif, system-ui, -apple-system, Segoe UI`;
          ctx.fillStyle = "rgba(255,255,255,0.98)";
          ctx.fillText(lyricStr, startX, cy);
        }

        const showNote = (!lyricStr && wNote <= available) || (lyricStr && canShowBoth);
        if (showNote) {
          const noteX = lyricStr ? startX + wLyric + gap : startX;
          ctx.font = `${notePx}px ui-sans-serif, system-ui, -apple-system, Segoe UI`;
          ctx.fillStyle = "rgba(255,255,255,0.78)";
          ctx.fillText(noteLabel, noteX, cy);
        }
      };

      // ----- Notes (scroll by view time) -----
      const visLeft = -64, visRight = width + 64;
      let activeIdx = -1;
      for (let i = 0; i < phrase.notes.length; i++) {
        const n = phrase.notes[i];
        const x = anchorX + (n.startSec - tView) * pxPerSec;
        const w = n.durSec * pxPerSec;
        if (x + w < visLeft || x > visRight) continue;

        const { y, h } = midiCellRect(n.midi, height, minMidi, maxMidi);

        ctx.fillStyle = PR_COLORS.noteFill;
        const drawW = Math.max(2, Math.round(w));
        const rx = Math.round(x) + 0.5;
        const ry = Math.round(y) + 0.5;
        const rh = Math.round(h);
        ctx.fillRect(rx, ry, drawW, rh);
        ctx.strokeStyle = PR_COLORS.noteStroke;
        ctx.lineWidth = 1;
        ctx.strokeRect(rx, ry, drawW, rh);

        if (drawW >= 24 && h >= 14) {
          const { name, octave } = midiToNoteName(n.midi, { useSharps: true, octaveAnchor: "A" });
          drawInlineWordAndNote(rx, ry, drawW, rh, lyrics?.[i], `${name}${octave}`);
        }

        const nextStart = phrase.notes[i + 1]?.startSec ?? n.startSec + n.durSec;
        if (headTime >= n.startSec && headTime < nextStart) activeIdx = i;
      }

      if (activeIdx !== lastActiveRef.current) {
        lastActiveRef.current = activeIdx;
        onActiveNoteChange?.(activeIdx);
      }

      // ----- Live pitch curve (only when "live") -----
      if (isLive && pointsRef.current.length > 1) {
        ctx.lineWidth = 2;
        ctx.strokeStyle = PR_COLORS.trace;
        ctx.beginPath();
        let pen = false;
        for (const p of pointsRef.current) {
          const x = anchorX + (p.t - tNow) * pxPerSec;
          const y = midiToY(p.midi, height, minMidi, maxMidi);
          if (!pen) { ctx.moveTo(x, y); pen = true; } else { ctx.lineTo(x, y); }
        }
        ctx.stroke();
      }

      // ----- Playhead dot -----
      const DOT_RADIUS = 7;
      const xGuide = Math.round(anchorX) + 0.5;
      const easeOutCubic = (u: number) => 1 - Math.pow(1 - u, 3);

      if (activeIdx >= 0) {
        const cur = phrase.notes[activeIdx];
        const nxt = phrase.notes[activeIdx + 1] ?? cur;

        const nextStart = nxt.startSec;
        const denom = Math.max(0.001, nextStart - cur.startSec);
        const uRaw = clamp((headTime - cur.startSec) / denom, 0, 1);
        const u = easeOutCubic(uRaw);

        const goingUp = nxt.midi > cur.midi;
        const curCell = midiCellRect(cur.midi, height, minMidi, maxMidi);
        const yEdgeStart = goingUp ? curCell.y : curCell.y + curCell.h;
        const yStart = yEdgeStart;
        const yEnd = midiToYCenter(nxt.midi, height, minMidi, maxMidi);

        const dy = yEnd - yStart;
        const cellH = curCell.h;
        const baseArc = Math.abs(dy) * 0.25 + cellH * 0.15;
        const arc = clamp(baseArc, 6, 22);
        const yCtrl = yStart + (goingUp ? -arc : arc);

        const yGuide = (1 - u) * (1 - u) * yStart + 2 * (1 - u) * u * yCtrl + u * u * yEnd;

        ctx.fillStyle = PR_COLORS.dotFill;
        ctx.beginPath();
        ctx.arc(xGuide, yGuide, DOT_RADIUS, 0, Math.PI * 2);
        ctx.fill();
        ctx.lineWidth = 1.25;
        ctx.strokeStyle = PR_COLORS.dotStroke;
        ctx.stroke();
      } else if (phrase.notes.length && headTime < phrase.notes[0].startSec) {
        const first = phrase.notes[0];
        const next = phrase.notes[1] ?? first;
        const goingUp = next.midi > first.midi;
        const firstCell = midiCellRect(first.midi, height, minMidi, maxMidi);
        const yEdge = goingUp ? firstCell.y : firstCell.y + firstCell.h;

        ctx.fillStyle = PR_COLORS.dotFill;
        ctx.beginPath();
        ctx.arc(xGuide, yEdge, DOT_RADIUS, 0, Math.PI * 2);
        ctx.fill();
        ctx.lineWidth = 1.25;
        ctx.strokeStyle = PR_COLORS.dotStroke;
        ctx.stroke();
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
      onActiveNoteChange,
      leadInSec,
      startAtMs,
      dpr,
      lyrics,
      getWidth12,
    ]
  );

  // keep draw stable across renders
  const drawRef = useRef(draw);
  useEffect(() => {
    drawRef.current = draw;
  }, [draw]);

  // RAF loop — ALWAYS run while "running"; we'll freeze visually until startAtMs is set
  useEffect(() => {
    if (running) {
      if (startRef.current == null) {
        startRef.current = performance.now();
        pointsRef.current = [];
      }
      const step = (ts: number) => {
        drawRef.current(ts);
        rafRef.current = requestAnimationFrame(step);
      };
      rafRef.current = requestAnimationFrame(step);
    } else {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      startRef.current = null;
      drawRef.current(performance.now()); // paint a clean static frame
      lastActiveRef.current = -1;
      pointsRef.current = [];
    }
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [running]);

  // Append live pitch samples only when truly "live" (prevents pre-anchor jitter)
  useEffect(() => {
    const isLive = running && startAtMs != null;
    if (!isLive) return;
    if (!livePitchHz || confidence < (confThreshold ?? 0.5)) return;

    const tNow = (performance.now() - (startAtMs as number)) / 1000;
    const midi = hzToMidi(livePitchHz, a4Hz);
    if (!isFinite(midi)) return;

    pointsRef.current.push({ t: tNow, midi });

    const keepFrom = tNow - windowSec * 1.5;
    if (pointsRef.current.length > 2000) {
      pointsRef.current = pointsRef.current.filter((p) => p.t >= keepFrom);
    }
  }, [running, livePitchHz, confidence, confThreshold, a4Hz, windowSec, startAtMs]);

  return (
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
  );
}
