"use client";

import React, { useEffect, useMemo, useRef } from "react";
import { hzToMidi } from "@/utils/pitch";

type Note = { midi: number; startSec: number; durSec: number };
type Phrase = { durationSec: number; notes: Note[] };

type Props = {
  width?: number;
  height?: number;
  phrase: Phrase;
  running: boolean;
  livePitchHz?: number | null;
  confidence?: number;
  confThreshold?: number;
  a4Hz?: number; // default 440
};

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export default function PianoRollCanvas({
  width = 800,
  height = 240,
  phrase,
  running,
  livePitchHz,
  confidence = 0,
  confThreshold = 0.5,
  a4Hz = 440,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const staticRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const startRef = useRef<number | null>(null);
  const pointsRef = useRef<Array<{ t: number; midi: number }>>([]);

  const { minMidi, maxMidi } = useMemo(() => {
    let mn = Infinity, mx = -Infinity;
    for (const n of phrase.notes) { mn = Math.min(mn, n.midi); mx = Math.max(mx, n.midi); }
    if (!isFinite(mn) || !isFinite(mx)) { mn = 60; mx = 72; }
    const pad = 2;
    return { minMidi: Math.floor(mn - pad), maxMidi: Math.ceil(mx + pad) };
  }, [phrase]);

  const timeToX = (t: number, W: number) => (t / phrase.durationSec) * W;
  const midiToY = (midi: number, H: number) => {
    const span = Math.max(1e-6, maxMidi - minMidi);
    const y = H - ((midi - minMidi) / span) * H;
    return clamp(y, 0, H);
  };

  const buildStatic = () => {
    const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
    if (!staticRef.current) staticRef.current = document.createElement("canvas");
    const s = staticRef.current;
    s.width = Math.floor(width * dpr);
    s.height = Math.floor(height * dpr);
    const ctx = s.getContext("2d"); if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    ctx.fillStyle = "#111";
    ctx.fillRect(0, 0, width, height);

    const span = maxMidi - minMidi;
    for (let i = 0; i <= span; i++) {
      const midi = minMidi + i;
      const y = midiToY(midi, height);
      const isC = midi % 12 === 0;
      ctx.strokeStyle = isC ? "rgba(255,255,255,0.25)" : "rgba(255,255,255,0.12)";
      ctx.lineWidth = isC ? 1.25 : 0.75;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke();
      if (isC) {
        const octave = Math.floor(midi / 12) - 1;
        ctx.fillStyle = "rgba(255,255,255,0.6)";
        ctx.font = "11px ui-sans-serif, system-ui, -apple-system, Segoe UI";
        ctx.fillText(`C${octave}`, 4, Math.max(10, y - 2));
      }
    }

    for (const note of phrase.notes) {
      const x = timeToX(note.startSec, width);
      const w = timeToX(note.durSec, width);
      const y = midiToY(note.midi, height);
      const h = Math.max(6, (height / Math.max(8, span)) * 0.8);

      ctx.fillStyle = "#3bb3ff";
      ctx.fillRect(Math.round(x) + 0.5, Math.round(y - h / 2) + 0.5, Math.max(2, Math.round(w)), Math.round(h));

      ctx.strokeStyle = "rgba(0,0,0,0.3)";
      ctx.lineWidth = 1;
      ctx.strokeRect(Math.round(x) + 0.5, Math.round(y - h / 2) + 0.5, Math.max(2, Math.round(w)), Math.round(h));
    }

    ctx.strokeStyle = "rgba(255,255,255,0.18)";
    ctx.lineWidth = 1;
    for (let t = 0; t <= phrase.durationSec; t += 1) {
      const x = timeToX(t, width);
      ctx.beginPath(); ctx.moveTo(Math.round(x) + 0.5, 0); ctx.lineTo(Math.round(x) + 0.5, height); ctx.stroke();
    }
  };

  const drawFrame = (nowMs: number) => {
    const cnv = canvasRef.current!;
    const dpr = window.devicePixelRatio || 1;
    if (cnv.width !== Math.floor(width * dpr) || cnv.height !== Math.floor(height * dpr)) {
      cnv.width = Math.floor(width * dpr);
      cnv.height = Math.floor(height * dpr);
    }
    const ctx = cnv.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    if (staticRef.current) {
      ctx.drawImage(staticRef.current, 0, 0, staticRef.current.width, staticRef.current.height, 0, 0, width, height);
    } else {
      ctx.fillStyle = "#111"; ctx.fillRect(0, 0, width, height);
    }

    const start = startRef.current;
    const tNow = start != null && running ? (nowMs - start) / 1000 : 0;

    const cutoff = Math.max(0, tNow - phrase.durationSec);
    pointsRef.current = pointsRef.current.filter(p => p.t >= cutoff && p.t <= phrase.durationSec);

    ctx.lineWidth = 2;
    ctx.strokeStyle = "#ffd54a";
    ctx.beginPath();
    let penDown = false;
    for (const p of pointsRef.current) {
      const x = timeToX(p.t, width);
      const y = midiToY(p.midi, height);
      if (!penDown) { ctx.moveTo(x, y); penDown = true; } else { ctx.lineTo(x, y); }
    }
    ctx.stroke();

    const xNow = timeToX(clamp(tNow, 0, phrase.durationSec), width);
    ctx.strokeStyle = "rgba(255,255,255,0.6)";
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(Math.round(xNow) + 0.5, 0); ctx.lineTo(Math.round(xNow) + 0.5, height); ctx.stroke();

    const last = [...pointsRef.current].reverse()[0];
    if (last) {
      const x = timeToX(last.t, width);
      const y = midiToY(last.midi, height);
      ctx.fillStyle = "#ff4d4f";
      ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fill();
      ctx.lineWidth = 1; ctx.strokeStyle = "rgba(0,0,0,0.6)"; ctx.stroke();
    }
  };

  const loop = (ts: number) => { drawFrame(ts); rafRef.current = requestAnimationFrame(loop); };

  useEffect(() => { buildStatic(); /* eslint-disable-next-line */ }, [phrase, width, height, minMidi, maxMidi]);

  useEffect(() => {
    if (running) {
      startRef.current = performance.now();
      pointsRef.current = [];
      rafRef.current = requestAnimationFrame(loop);
    } else {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      startRef.current = null;
      drawFrame(performance.now());
    }
    return () => { if (rafRef.current != null) cancelAnimationFrame(rafRef.current); rafRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, phrase]);

  useEffect(() => {
    if (!running) return;
    if (livePitchHz && confidence >= confThreshold) {
      const tNow = startRef.current != null ? (performance.now() - startRef.current) / 1000 : 0;
      const midi = hzToMidi(livePitchHz, a4Hz);
      pointsRef.current.push({ t: clamp(tNow, 0, phrase.durationSec), midi });
    }
  }, [livePitchHz, confidence, running, confThreshold, phrase.durationSec, a4Hz]);

  return <canvas ref={canvasRef} style={{ width, height, display: "block", borderRadius: 10, boxShadow: "0 2px 12px rgba(0,0,0,.15)" }} />;
}
