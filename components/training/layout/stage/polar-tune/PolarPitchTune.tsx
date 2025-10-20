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
  targetRel?: number; // 0..11
};

const BLUE_LIVE   = "rgba(132, 179, 246, VAR_A)";
const GREEN_NEAR  = "rgba(90, 198, 152, VAR_A)";
const GREEN_SPOT  = "rgba(35, 215, 148, VAR_A)";

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

    const dpr = Math.max(1, window?.devicePixelRatio ?? 1);
    c.width = Math.max(1, Math.floor(width * dpr));
    c.height = Math.max(1, Math.floor(height * dpr));

    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    const size = Math.min(width, height);
    const cx = width / 2, cy = height / 2;

    // live bands only (no label bubble)
    if (typeof liveHz === "number" && liveHz > 0) {
      const midi = hzToMidi(liveHz, 440);
      const rel = relPcFloat(midi, tonicPc);
      const alpha = clamp((confidence - confThreshold) / Math.max(0.001, 1 - confThreshold), 0, 1);

      // cents to target
      let dRel = rel - targetRel;
      if (dRel > 6) dRel -= 12;
      if (dRel < -6) dRel += 12;
      const cents = dRel * 100;

      const isInTune = Math.abs(cents) <= 20;

      // basic ring geometry
      const R = size * 0.48;
      const r = size * 0.28;
      const CENTER_R = r * 0.5;
      const INNER_GAP_PX = Math.max(1.5, size * 0.008);
      const innerR = CENTER_R + INNER_GAP_PX;

      const gap = (Math.PI / 180) * 6;
      const sector = (2 * Math.PI - gap * 12) / 12;
      const START = -Math.PI / 2 - sector / 2;

      const heights = new Array(12).fill(0);
      const low = Math.floor(rel);
      const high = (low + 1) % 12;
      const frac = rel - low;
      let wLow = 1 - frac;
      let wHigh = frac;

      const nearestIdx = (((Math.round(rel)) % 12) + 12) % 12;
      const rawMask = clamp((Math.abs(cents) - 20) / 80, 0, 1);
      const mask = Math.pow(rawMask, 1.2);
      if (nearestIdx === (((targetRel % 12) + 12) % 12)) {
        if (low === targetRel) wHigh *= mask;
        else if (high === targetRel) wLow *= mask;
      }
      heights[((low % 12) + 12) % 12] = wLow;
      heights[((high % 12) + 12) % 12] = wHigh;

      for (let i = 0; i < 12; i++) {
        const extH = heights[i];
        if (extH <= 0) continue;

        const a0 = START + i * (sector + gap);
        const a1 = a0 + sector;

        const Re = innerR + (R - innerR) * extH;
        const xo0e = cx + Re * Math.cos(a0);
        const yo0e = cy + Re * Math.sin(a0);
        const xo1e = cx + Re * Math.cos(a1);
        const yo1e = cy + Re * Math.sin(a1);

        const xi0e = cx + innerR * Math.cos(a0);
        const yi0e = cy + innerR * Math.sin(a0);
        const xi1e = cx + innerR * Math.cos(a1);
        const yi1e = cy + innerR * Math.sin(a1);

        const d_ext = `M ${xo0e} ${yo0e} A ${Re} ${Re} 0 0 1 ${xo1e} ${yo1e} L ${xi1e} ${yi1e} A ${innerR} ${innerR} 0 0 0 ${xi0e} ${yi0e} Z`;

        const isTargetWedge = i === (((targetRel % 12) + 12) % 12);
        const colorTpl = isTargetWedge
          ? (isInTune ? GREEN_SPOT : GREEN_NEAR)
          : BLUE_LIVE;
        const extFill = colorTpl.replace('VAR_A', String(alpha.toFixed(3)));

        const p = new Path2D(d_ext);
        ctx.fillStyle = extFill;
        ctx.fill(p);
      }
    }
  }, [width, height, liveHz, confidence, confThreshold, tonicPc, targetRel]);

  return <canvas ref={ref} style={{ width, height, display: "block" }} />;
}
