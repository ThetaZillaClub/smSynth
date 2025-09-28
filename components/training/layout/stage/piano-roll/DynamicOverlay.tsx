// components/training/layout/stage/piano-roll/DynamicOverlay.tsx
"use client";
import React, { useEffect, useRef, useCallback, useMemo } from "react";
import {
  clamp,
  midiToY,
  midiToYCenter,
  midiCellRect,
  PR_COLORS,
  type Phrase,
} from "@/utils/stage";
import { hzToMidi, midiToNoteName } from "@/utils/pitch/pitchMath";

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

  // Active note index (by *segment start*)
  const lastActiveRef = useRef<number>(-1);

  // Live pitch points for trace
  const pointsRef = useRef<Array<{ t: number; midi: number }>>([]);

  // device pixel ratio
  const dpr = useMemo(
    () => (typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1),
    []
  );

  // Keep last Y for safety render if needed
  const lastYRef = useRef<number | null>(null);

  // --- small text width cache (12px baseline) ---
  const width12CacheRef = useRef<Map<string, number>>(new Map());
  const getWidth12 = useCallback(
    (ctx: CanvasRenderingContext2D, text: string, bold = false) => {
      const key = (bold ? "b|" : "n|") + text;
      const cached = width12CacheRef.current.get(key);
      if (cached != null) return cached;
      ctx.font = `${bold ? "700 " : ""}12px ui-sans-serif, system-ui, -apple-system, Segoe UI`;
      const w = ctx.measureText(text).width;
      width12CacheRef.current.set(key, w);
      return w;
    },
    []
  );

  // --- easing (easeInOutCirc) ---
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

  // --- time-base smoothing to remove the initial jerk when startAtMs drops in ---
  const wasLiveRef = useRef<boolean>(false);
  const smoothNowSecRef = useRef<number>(0); // displayed transport seconds
  const lastFrameMsRef = useRef<number | null>(null);
  const liveBecameRef = useRef<number | null>(null); // ms timestamp when we became "live"
  const SMOOTH_TAU_MS = 120; // time constant for smoothing
  const SMOOTH_WINDOW_MS = 220; // only smooth for this long after going live
  const prevStartAtRef = useRef<number | null>(null);

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

      // ----- Time base (with short settle filter when we first get startAtMs) -----
      const isLive = running && startAtMs != null;
      const targetNowSec = isLive
        ? Math.max(0, (nowMs - (startAtMs as number)) / 1000)
        : 0;

      // detect live transition
      if (isLive && !wasLiveRef.current) {
        liveBecameRef.current = nowMs;
        // start smoothing from where the preview sits (0s)
        smoothNowSecRef.current = 0;
      } else if (!isLive) {
        liveBecameRef.current = null;
        smoothNowSecRef.current = 0;
      }

      // Reset smoothing on startAtMs change (new take)
      if (isLive && startAtMs !== prevStartAtRef.current) {
        prevStartAtRef.current = startAtMs;
        liveBecameRef.current = nowMs;
        smoothNowSecRef.current = 0;
      }

      wasLiveRef.current = isLive;

      // smooth only briefly after we become live, to avoid the big jump
      const lastMs = lastFrameMsRef.current ?? nowMs;
      const dt = Math.max(0, nowMs - lastMs);
      lastFrameMsRef.current = nowMs;

      let tNowSec: number;
      if (
        isLive &&
        liveBecameRef.current != null &&
        nowMs - liveBecameRef.current < SMOOTH_WINDOW_MS
      ) {
        const alpha = 1 - Math.exp(-dt / SMOOTH_TAU_MS);
        smoothNowSecRef.current +=
          (targetNowSec - smoothNowSecRef.current) * alpha;
        tNowSec = smoothNowSecRef.current;
      } else {
        tNowSec = targetNowSec;
        smoothNowSecRef.current = targetNowSec;
      }

      const anchorX = Math.max(0, Math.min(width * anchorRatio, width - 1));
      const pxPerSec = (width - anchorX) / Math.max(0.001, windowSec);

      // "headTime" = phrase-time at the anchor (left side shows lead-in)
      const tView = tNowSec - leadInSec;
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

        const { y, h } = midiCellRect(midi, height, minMidi, maxMidi);
        const centerY = y + h / 2;
        ctx.fillStyle = PR_COLORS.label;
        ctx.font = "13px ui-sans-serif, system-ui, -apple-system, Segoe UI";
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        const { name, octave } = midiToNoteName(midi, {
          useSharps: true,
          octaveAnchor: "C",
        });
        ctx.fillText(`${name}${octave}`, 4, centerY);
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
        const notePx = Math.min(12, Math.max(10, Math.floor(h * 0.4)));

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
          const maxChars = Math.max(
            1,
            Math.floor((available * 12) / (avgChar * wordPx)) - 1
          );
          lyricStr = lyricStr.slice(0, maxChars) + "…";
          const ell12 = getWidth12(ctx, lyricStr, true);
          wLyric = (ell12 * wordPx) / 12;
        }

        const total = lyricStr
          ? canShowBoth
            ? wLyric + gap + (wNote <= available ? wNote : 0)
            : wLyric
          : wNote;

        const startX = cx - total / 2;

        if (lyricStr) {
          ctx.font = `700 ${wordPx}px ui-sans-serif, system-ui, -apple-system, Segoe UI`;
          ctx.fillStyle = "rgba(255,255,255,0.98)";
          ctx.fillText(lyricStr, startX, cy);
        }
        const showNote =
          (!lyricStr && wNote <= available) || (lyricStr && canShowBoth);
        if (showNote) {
          const noteX = lyricStr ? startX + wLyric + gap : startX;
          ctx.font = `${notePx}px ui-sans-serif, system-ui, -apple-system, Segoe UI`;
          ctx.fillStyle = "rgba(255,255,255,0.78)";
          ctx.fillText(noteLabel, noteX, cy);
        }
      };

      // ----- Notes (scroll by view time) -----
      const visLeft = -64,
        visRight = width + 64;
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
          const { name, octave } = midiToNoteName(n.midi, {
            useSharps: true,
            octaveAnchor: "C",
          });
          drawInlineWordAndNote(
            rx,
            ry,
            drawW,
            rh,
            lyrics?.[i],
            `${name}${octave}`
          );
        }
      }

      // ----- Live pitch curve (only when "live") -----
      if (isLive && pointsRef.current.length > 1) {
        ctx.lineWidth = 2;
        ctx.strokeStyle = PR_COLORS.trace;
        ctx.beginPath();
        let pen = false;
        for (const p of pointsRef.current) {
          const x = anchorX + (p.t - tNowSec) * pxPerSec; // use smoothed transport
          const y = midiToY(p.midi, height, minMidi, maxMidi);
          if (!pen) {
            ctx.moveTo(x, y);
            pen = true;
          } else {
            ctx.lineTo(x, y);
          }
        }
        ctx.stroke();
      }

      // =========================
      // Playhead dot (ALWAYS on)
      // Ease between note STARTS so it survives rests.
      // =========================
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
        // Find the current *segment* by note starts:
        // segment i covers [start_i, start_{i+1})
        let segIdx = -1;
        for (let i = 0; i < phrase.notes.length; i++) {
          const s0 = phrase.notes[i].startSec;
          const s1 = phrase.notes[i + 1]?.startSec ?? Infinity;
          if (headTime >= s0 && headTime < s1) {
            segIdx = i;
            break;
          }
        }

        // Notify the active starting note *only* when inside the phrase
        if (segIdx !== lastActiveRef.current) {
          lastActiveRef.current = segIdx;
          if (segIdx >= 0) onActiveNoteChange?.(segIdx);
        }

        // Clamp to a valid index so the dot is stable before/after the phrase
        let i = segIdx;
        if (i < 0) i = 0;
        if (i >= phrase.notes.length) i = phrase.notes.length - 1;

        const cur = phrase.notes[i];
        const nxt = phrase.notes[i + 1] ?? cur;

        const denom = Math.max(0.001, nxt.startSec - cur.startSec);
        const uRaw = (headTime - cur.startSec) / denom; // may be <0 or >1 at the edges
        const u = easeInOutCirc(clamp(uRaw, 0, 1));

        const yStart = midiToYCenter(cur.midi, height, minMidi, maxMidi);
        const yEnd = midiToYCenter(nxt.midi, height, minMidi, maxMidi);
        const yGuide = yStart + (yEnd - yStart) * u;

        drawDotAtY(yGuide);
      } else {
        // No notes at all → center the dot
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
      getWidth12,
      onActiveNoteChange,
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
        // reset smoothing trackers on (re)start
        wasLiveRef.current = false;
        smoothNowSecRef.current = 0;
        lastFrameMsRef.current = null;
        liveBecameRef.current = null;
        prevStartAtRef.current = null;
        // Initial lastY (middle of range if no notes)
        lastYRef.current = height / 2;
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
      // reset smoothing state
      wasLiveRef.current = false;
      smoothNowSecRef.current = 0;
      lastFrameMsRef.current = null;
      liveBecameRef.current = null;
      prevStartAtRef.current = null;
    }
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [running, height]);

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

  // Clear pitch points when startAtMs changes (new take)
  useEffect(() => {
    pointsRef.current = [];
  }, [startAtMs]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        width: `${width}px`,
        height: `${height}px`,
        display: "block",
        position: "absolute",
        inset: 0,
        // micro-UX: make initial paint feel smoother when styles/fonts settle
        willChange: "transform",
        transition: "opacity 120ms ease-out",
      }}
    />
  );
}
