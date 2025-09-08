"use client";
import React, { useEffect, useRef, useCallback } from "react";
import { clamp, midiToY, midiToYCenter, midiCellRect, PR_COLORS } from "./scale";
import { hzToMidi } from "@/utils/pitch/pitchMath";
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

  leadInSec?: number;
};

// Simple MIDI → name helper (A4=440 semantics not needed for note spelling)
// Simple MIDI → name helper (A-based octave numbering: octave increments at A)
function midiToNameAOctave(m: number, useSharps = true) {
  const SHARP = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];
  const FLAT  = ["C","Db","D","Eb","E","F","Gb","G","Ab","A","Bb","B"];
  const names = useSharps ? SHARP : FLAT;

  const pc = ((m % 12) + 12) % 12;     // pitch class 0..11
  const name = names[pc];

  // base (C-based) octave
  let octave = Math.floor(m / 12) - 1;

  // shift up by 1 for A/A#/B (pc >= 9) to make octave change happen at A
  if (pc >= 9) octave += 1;

  return `${name}${octave}`;
}


export default function DynamicOverlay({
  width,
  height,
  phrase,
  running,
  onActiveNoteChange,
  minMidi,
  maxMidi,
  windowSec = 4,
  anchorRatio = 0.10,

  livePitchHz = null,
  confidence = 0,
  confThreshold = 0.5,
  a4Hz = 440,

  leadInSec = 1.5,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const startRef = useRef<number | null>(null);
  const lastActiveRef = useRef<number>(-1);
  const pointsRef = useRef<Array<{ t: number; midi: number }>>([]);

  const draw = useCallback((nowMs: number) => {
    const cnv = canvasRef.current;
    if (!cnv) return;

    const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;

    // Ensure backing store matches CSS pixels exactly → prevents any stretch
    const wantW = Math.round(width * dpr);
    const wantH = Math.round(height * dpr);
    if (cnv.width !== wantW) cnv.width = wantW;
    if (cnv.height !== wantH) cnv.height = wantH;

    const ctx = cnv.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Layout & time
    const anchorX = Math.max(0, Math.min(width * anchorRatio, width - 1));
    const pxPerSec = (width - anchorX) / Math.max(0.001, windowSec);

    const t0 = startRef.current ?? nowMs;
    const tNow = running ? (nowMs - t0) / 1000 : 0;

    const tView = tNow - leadInSec;
    const headTime = tView;

    // clear + bg
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = PR_COLORS.bg;
    ctx.fillRect(0, 0, width, height);

    // horizontal grid + octave labels centered in their cells
    const span = maxMidi - minMidi;
    for (let i = 0; i <= span; i++) {
      const midi = minMidi + i;

      // grid line (MIDI boundary)
      const yLine = midiToY(midi, height, minMidi, maxMidi);
      const isC = midi % 12 === 0;
      ctx.strokeStyle = isC ? PR_COLORS.gridMajor : PR_COLORS.gridMinor;
      ctx.lineWidth = isC ? 1.25 : 0.75;
      ctx.beginPath();
      ctx.moveTo(0, yLine);
      ctx.lineTo(width, yLine);
      ctx.stroke();

      // label "C#" only for C rows; center vertically within the C cell
      if (isC) {
        const cell = midiCellRect(midi, height, minMidi, maxMidi);
        const centerY = cell.y + cell.h / 2;

        ctx.fillStyle = PR_COLORS.label;
        ctx.font = "11px ui-sans-serif, system-ui, -apple-system, Segoe UI";
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        const octave = Math.floor(midi / 12) - 1;
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

      // green block
      ctx.fillStyle = PR_COLORS.noteFill;
      const drawW = Math.max(2, Math.round(w));
      ctx.fillRect(Math.round(x) + 0.5, Math.round(y) + 0.5, drawW, Math.round(h));
      ctx.strokeStyle = PR_COLORS.noteStroke;
      ctx.lineWidth = 1;
      ctx.strokeRect(Math.round(x) + 0.5, Math.round(y) + 0.5, drawW, Math.round(h));

// label inside note (centered)
const minWForText = 28;
const minHForText = 14;
if (drawW >= minWForText && h >= minHForText) {
  const label = midiToNameAOctave(n.midi, true); // ← A-based octave numbering
  ctx.fillStyle = "rgba(255,255,255,0.95)";
  ctx.font = "12px ui-sans-serif, system-ui, -apple-system, Segoe UI";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, Math.round(x) + drawW / 2, Math.round(y) + h / 2);
}


      // choose "active" by the playhead's musical time (aligns lyrics & dot)
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

    // Playhead dot — keep perfectly round
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
  }, [width, height, phrase, running, minMidi, maxMidi, windowSec, anchorRatio, onActiveNoteChange, leadInSec]);

  // keep draw stable across renders
  const drawRef = useRef(draw);
  useEffect(() => { drawRef.current = draw; }, [draw]);

  // RAF loop
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
      drawRef.current(performance.now());
    }
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [running]);

  // append live pitch samples (timestamped in engine time tNow)
  useEffect(() => {
    if (!running) return;
    if (!livePitchHz || confidence < (confThreshold ?? 0.5)) return;
    if (startRef.current == null) return;

    const tNow = (performance.now() - startRef.current) / 1000;
    const midi = hzToMidi(livePitchHz, a4Hz);
    if (!isFinite(midi)) return;

    pointsRef.current.push({ t: tNow, midi });

    const keepFrom = tNow - (windowSec * 1.5);
    if (pointsRef.current.length > 2000) {
      pointsRef.current = pointsRef.current.filter(p => p.t >= keepFrom);
    }
  }, [running, livePitchHz, confidence, confThreshold, a4Hz, windowSec]);

  return (
    <canvas
      ref={canvasRef}
      /* Fixed CSS size to avoid any scaling → ensures perfect circle */
      style={{
        width: `${width}px`,
        height: `${height}px`,
        display: "block",
        position: "absolute",
        inset: 0
      }}
    />
  );
}
