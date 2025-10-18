// components/training/layout/stage/polar-tune/PolarPitchTune.tsx
"use client";
import * as React from "react";
import { hzToMidi, relPcFloat, clamp } from "./polar-helpers";

type Props = {
  width: number;
  height: number;
  liveHz: number | null;
  confidence: number;
  confThreshold: number;
  tonicPc: number;
  targetRel?: number; // 0..11 (target semitone index in rel space)
};

const BLUE_ACCENT = "rgba(132, 179, 246, 0.35)";
const TEXT_BLUE   = "rgb(30, 64, 175)";
const TEXT_GREEN_NEAR = "rgb(90, 198, 152)";  // correct note, not spot-on
const TEXT_GREEN_SPOT = "rgb(35, 215, 148)";  // correct & spot-on

export default function PolarPitchTune({
  width,
  height,
  liveHz,
  confidence,
  confThreshold,
  tonicPc,
  targetRel = 0,
}: Props) {
  const ref = React.useRef<HTMLCanvasElement | null>(null);

  React.useEffect(() => {
    const c = ref.current;
    if (!c) return;

    const dpr = Math.max(1, (window as any).devicePixelRatio || 1);
    c.width = Math.max(1, Math.floor(width * dpr));
    c.height = Math.max(1, Math.floor(height * dpr));

    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    const size = Math.min(width, height);
    const cx = width / 2, cy = height / 2;

    // ——— removed: capture arc + center divider (expected pitch markers)

    // live readout bubble
    if (typeof liveHz === "number" && liveHz > 0) {
      const midi = hzToMidi(liveHz, 440);
      const rel = relPcFloat(midi, tonicPc); // (0..12)
      const alpha = clamp((confidence - confThreshold) / Math.max(0.001, 1 - confThreshold), 0, 1);

      // cents to target (shortest wrap)
      let dRel = rel - targetRel;
      if (dRel > 6) dRel -= 12;
      if (dRel < -6) dRel += 12;
      const cents = dRel * 100;

      // is the *sung* semitone (nearest) the target semitone?
      const nearestIdx = (((Math.round(rel)) % 12) + 12) % 12;
      const isCorrectNote = nearestIdx === (((targetRel % 12) + 12) % 12);
      const inTune = Math.abs(cents) <= 20;

      const arrow = cents < -3 ? "↑" : cents > 3 ? "↓" : "•";
      const label = `${arrow} ${Math.round(Math.abs(cents))}¢`;

      const tx = cx, ty = cy + size * 0.30;
      ctx.font = `${Math.max(10, size * 0.05)}px ui-sans-serif, system-ui, -apple-system`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

      // bubble frame
      const padX = size * 0.06, padY = size * 0.025;
      const tw = ctx.measureText(label).width;
      const bw = tw + padX * 2;
      const bh = Math.max(size * 0.08, padY * 2 + 12);

      ctx.fillStyle = "rgba(255,255,255,0.9)";
      ctx.strokeStyle = BLUE_ACCENT;
      ctx.lineWidth = 1;
      roundRect(ctx, tx - bw / 2, ty - bh / 2, bw, bh, Math.max(6, size * 0.02));
      ctx.fill();
      ctx.stroke();

      // text color logic:
      // correct note → green; spot-on → brighter green; otherwise blue.
      let color = TEXT_BLUE;
      if (isCorrectNote) color = inTune ? TEXT_GREEN_SPOT : TEXT_GREEN_NEAR;
      const [rC, gC, bC] = color.match(/\d+/g)!.map(Number);
      ctx.fillStyle = `rgba(${rC},${gC},${bC},${alpha})`;
      ctx.fillText(label, tx, ty);
    }

    function roundRect(
      ctx: CanvasRenderingContext2D,
      x: number,
      y: number,
      w: number,
      h: number,
      r: number
    ) {
      const rr = Math.min(r, w / 2, h / 2);
      ctx.beginPath();
      ctx.moveTo(x + rr, y);
      ctx.arcTo(x + w, y, x + w, y + h, rr);
      ctx.arcTo(x + w, y + h, x, y + h, rr);
      ctx.arcTo(x, y + h, x, y, rr);
      ctx.arcTo(x, y, x + w, y, rr);
      ctx.closePath();
    }
  }, [width, height, liveHz, confidence, confThreshold, tonicPc, targetRel]);

  return <canvas ref={ref} style={{ width, height, display: "block" }} />;
}
