"use client";

import React, { useEffect, useRef, useCallback, useMemo } from "react";
import { clamp, midiToY, midiToYCenter, midiCellRect, PR_COLORS } from "./scale";
import { hzToMidi, midiToNoteName } from "@/utils/pitch/pitchMath";
import type { Phrase } from "./types";

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

  // Fallback baseline when an external start isn't provided (e.g., preview mode)
  const startRef = useRef<number | null>(null);

  const lastActiveRef = useRef<number>(-1);
  const pointsRef = useRef<Array<{ t: number; midi: number }>>([]);

  const dpr = useMemo(
    () => (typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1),
    []
  );

  const draw = useCallback(
    (nowMs: number) => {
      const cnv = canvasRef.current;
      if (!cnv) return;

      // if we're running but don't yet have the recorder anchor, wait (prevents pre-roll skew)
      if (running && startAtMs == null) return;

      // Ensure backing store matches CSS pixels exactly → prevents stretch / oval artefacts
      const wantW = Math.round(width * dpr);
      const wantH = Math.round(height * dpr);
      if (cnv.width !== wantW) cnv.width = wantW;
      if (cnv.height !== wantH) cnv.height = wantH;

      const ctx = cnv.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // Helpers for single-row label layout (WORD [gap] NOTE)
      const fitWithEllipsis = (text: string, maxW: number) => {
        if (ctx.measureText(text).width <= maxW) return text;
        if (maxW <= 8) return ""; // nothing reasonable fits
        const ell = "…";
        let lo = 0, hi = text.length;
        while (lo < hi) {
          const mid = ((lo + hi) / 2) | 0;
          const trial = text.slice(0, mid) + ell;
          if (ctx.measureText(trial).width <= maxW) lo = mid + 1;
          else hi = mid;
        }
        const n = Math.max(0, lo - 1);
        return text.slice(0, n) + ell;
      };

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

        // Base sizes scaled by cell height, clamped to sensible desktop sizes
        const baseWordPx = Math.min(36, Math.max(12, Math.floor(h * 0.52)));
        const baseNotePx = Math.min(12, Math.max(10, Math.floor(h * 0.40)));

        // Start with bold lyric + lighter note
        let wordPx = baseWordPx;
        const notePx = baseNotePx;
        const gap = 6;

        // Measure & potentially shrink the word to fit the row; prefer keeping the note visible
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";

        const cx = x + w / 2;
        const cy = y + h / 2;

        const setWordFont = (px: number) =>
          (ctx.font = `700 ${px}px ui-sans-serif, system-ui, -apple-system, Segoe UI`);
        const setNoteFont = (px: number) =>
          (ctx.font = `${px}px ui-sans-serif, system-ui, -apple-system, Segoe UI`);

        const measureRow = (lyricStr: string, lyricPx: number) => {
          setWordFont(lyricPx);
          const wWord = lyricStr ? ctx.measureText(lyricStr).width : 0;
          setNoteFont(notePx);
          const wNote = ctx.measureText(noteLabel).width;
          return { wWord, wNote, total: (lyricStr ? wWord : 0) + (lyricStr ? gap : 0) + wNote };
        };

        let lyricStr = word ?? "";
        let { wWord, wNote, total } = measureRow(lyricStr, wordPx);

        // Try shrinking lyric size down to min to make both fit
        while (lyricStr && total > available && wordPx > 10) {
          wordPx -= 1;
          ({ wWord, wNote, total } = measureRow(lyricStr, wordPx));
        }

        // If still too wide, drop the note first (lyrics are primary)
        if (lyricStr && total > available) {
          setWordFont(wordPx);
          lyricStr = fitWithEllipsis(lyricStr, available);
          ({ wWord, wNote, total } = { wWord: ctx.measureText(lyricStr).width, wNote: 0, total: ctx.measureText(lyricStr).width });
        }

        // If there is no lyric, try note alone centered
        if (!lyricStr) {
          setNoteFont(notePx);
          const noteW = ctx.measureText(noteLabel).width;
          if (noteW <= available) {
            ctx.fillStyle = "rgba(255,255,255,0.92)";
            ctx.fillText(noteLabel, cx - noteW / 2, cy);
          }
          return;
        }

        // Draw composed row centered
        const startX = cx - total / 2;

        // Lyric (bold, brighter)
        setWordFont(wordPx);
        ctx.fillStyle = "rgba(255,255,255,0.98)";
        ctx.fillText(lyricStr, startX, cy);

        // Note (smaller, slightly dimmer), only if it fits after lyric
        if (wNote > 0 && (wWord + gap + wNote) <= available) {
          setNoteFont(notePx);
          ctx.fillStyle = "rgba(255,255,255,0.78)";
          ctx.fillText(noteLabel, startX + wWord + gap, cy);
        }
      };

      // Layout & time
      const anchorX = Math.max(0, Math.min(width * anchorRatio, width - 1));
      const pxPerSec = (width - anchorX) / Math.max(0.001, windowSec);

      // Choose time base: recorder anchor if given, else internal baseline
      const baseMs = startAtMs ?? (startRef.current ?? nowMs);
      const tNow = running ? (nowMs - baseMs) / 1000 : 0;

      const tView = tNow - leadInSec;
      const headTime = tView;

      // clear + bg
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = PR_COLORS.bg;
      ctx.fillRect(0, 0, width, height);

      // horizontal grid + octave labels
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
          const cell = midiCellRect(midi, height, minMidi, maxMidi);
          const centerY = cell.y + cell.h / 2;

          ctx.fillStyle = PR_COLORS.label;
          ctx.font = "11px ui-sans-serif, system-ui, -apple-system, Segoe UI";
          ctx.textAlign = "left";
          ctx.textBaseline = "middle";
          const { octave } = midiToNoteName(midi, { useSharps: true, octaveAnchor: "A" });
          ctx.fillText(`C${octave}`, 4, centerY);
        }
      }

      // Notes (scroll right→left in VIEW time)
      const visLeft = -64, visRight = width + 64;
      let activeIdx = -1;
      for (let i = 0; i < phrase.notes.length; i++) {
        const n = phrase.notes[i];
        const x = anchorX + (n.startSec - tView) * pxPerSec;
        const w = n.durSec * pxPerSec;
        if (x + w < visLeft || x > visRight) continue;

        const { y, h } = midiCellRect(n.midi, height, minMidi, maxMidi);

        // block
        ctx.fillStyle = PR_COLORS.noteFill;
        const drawW = Math.max(2, Math.round(w));
        const rx = Math.round(x) + 0.5;
        const ry = Math.round(y) + 0.5;
        const rh = Math.round(h);
        ctx.fillRect(rx, ry, drawW, rh);
        ctx.strokeStyle = PR_COLORS.noteStroke;
        ctx.lineWidth = 1;
        ctx.strokeRect(rx, ry, drawW, rh);

        // single-row label: WORD (bold, larger) + NOTE (lighter) on one line
        const minWForText = 24;
        const minHForText = 14;
        if (drawW >= minWForText && h >= minHForText) {
          const { name, octave } = midiToNoteName(n.midi, { useSharps: true, octaveAnchor: "A" });
          const noteLabel = `${name}${octave}`;
          drawInlineWordAndNote(rx, ry, drawW, rh, lyrics?.[i], noteLabel);
        }

        // determine "active" note at playhead
        const nextStart = phrase.notes[i + 1]?.startSec ?? (n.startSec + n.durSec);
        if (headTime >= n.startSec && headTime < nextStart) activeIdx = i;
      }

      if (activeIdx !== lastActiveRef.current) {
        lastActiveRef.current = activeIdx;
        onActiveNoteChange?.(activeIdx);
      }

      // Live pitch curve
      {
        const left = tNow - (windowSec * 1.1);
        const right = tNow + 0.25;
        pointsRef.current = pointsRef.current.filter(p => p.t >= left && p.t <= right);

        if (pointsRef.current.length > 1) {
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
      }

      // Playhead dot
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
        const yEdgeStart = goingUp ? curCell.y : (curCell.y + curCell.h);
        const yStart = yEdgeStart;

        const yEnd = midiToYCenter(nxt.midi, height, minMidi, maxMidi);

        const dy = yEnd - yStart;
        const cellH = curCell.h;
        const baseArc = Math.abs(dy) * 0.25 + cellH * 0.15;
        const arc = clamp(baseArc, 6, 22);
        const yCtrl = yStart + (goingUp ? -arc : arc);

        const yGuide =
          (1 - u) * (1 - u) * yStart +
          2 * (1 - u) * u * yCtrl +
          u * u * yEnd;

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
        const yEdge = goingUp ? firstCell.y : (firstCell.y + firstCell.h);

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
    ]
  );

  // keep draw stable across renders
  const drawRef = useRef(draw);
  useEffect(() => {
    drawRef.current = draw;
  }, [draw]);

  // RAF loop — wait for startAtMs when running
  useEffect(() => {
    if (running && startAtMs == null) {
      // draw a static frame (no motion) while waiting for anchor
      drawRef.current(performance.now());
      return;
    }
    if (running) {
      if (startRef.current == null) {
        startRef.current = performance.now(); // fallback baseline
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
      drawRef.current(performance.now());
      lastActiveRef.current = -1;
      pointsRef.current = [];
    }
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [running, startAtMs]);

  // append live pitch samples aligned to the same time base
  useEffect(() => {
    if (!running) return;
    if (!livePitchHz || confidence < (confThreshold ?? 0.5)) return;

    const baseMs = startAtMs ?? startRef.current;
    if (baseMs == null) return;

    const tNow = (performance.now() - baseMs) / 1000;
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
      /* Fixed CSS size to avoid any scaling → ensures perfect circle */
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
