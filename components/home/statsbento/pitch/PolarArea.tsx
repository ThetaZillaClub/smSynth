// components/home/statsbento/pitch/PolarArea.tsx
'use client';

import * as React from 'react';
import { PR_COLORS } from '@/utils/stage';
import { useMeasure, useCanvas2d } from './hooks';
import { clamp01, clamp, ease } from './utils';
import type { Item } from './types';

const GAMMA = 0.9;

// Blue palette
const BLUE_FILL = '#3b82f6';
const BLUE_STROKE = '#2563eb';

// When radii are nearly equal, keep ordering stable
const ORDER_EPS = 0.75; // px

const normFromDataset = (vals: number[]): ((v: number) => number) => {
  const vMin = Math.min(...vals);
  const vMax = Math.max(...vals);
  const spread = vMax - vMin;
  if (!isFinite(vMin) || !isFinite(vMax) || spread <= 1e-6) {
    return () => Math.pow(0.75, GAMMA);
  }
  return (v: number) => Math.pow(clamp01((v - vMin) / spread), GAMMA);
};

export default function PolarArea({
  items,
  max1 = 100,
  max2 = 120,
  height = 360,
}: {
  items: Item[];
  max1?: number;
  max2?: number;
  height?: number;
}) {
  const { ref, width } = useMeasure();
  const sqH = width > 0 ? width : height;
  const { ref: canvasRef } = useCanvas2d(width, sqH);

  const [t, setT] = React.useState(0);
  const [hover, setHover] = React.useState<number | null>(null);

  React.useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const u = ease((now - start) / 800);
      setT(u);
      if (u < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [items.length]);

  React.useEffect(() => {
    const c = canvasRef.current; if (!c) return;
    const ctx = c.getContext('2d'); if (!ctx) return;

    const W = Math.max(1, width);
    const Hpx = Math.max(1, sqH);
    ctx.clearRect(0, 0, W, Hpx);

    const minSide = Math.min(W, Hpx);
    if (minSide < 64) return;

    // geometry
    const ringPad = 8;
    const labelOutset = Math.max(20, Math.min(30, minSide * 0.05));
    const R = Math.max(ringPad + 12, minSide * 0.5 - ringPad - labelOutset);
    const r0 = Math.max(0, R * 0.20);
    const Rmax = Math.max(r0 + 6, R - ringPad);

    const cx = W / 2, cy = Hpx / 2;

    const onVals  = items.map(it => clamp01(it.v1 / max1));
    const maeGood = items.map(it => clamp01(1 - it.v2 / max2));
    const normOn  = normFromDataset(onVals);
    const normMae = normFromDataset(maeGood);

    // rings
    ctx.save();
    ctx.translate(cx, cy);
    const rings = 4;
    for (let i = 1; i <= rings; i++) {
      const r = Math.max(1, r0 + (Rmax - r0) * (i / rings));
      ctx.strokeStyle = i % 2 === 0 ? PR_COLORS.gridMajor : PR_COLORS.gridMinor;
      ctx.lineWidth = i % 2 === 0 ? 3 : 2;
      ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.restore();

    // sectors
    const n = Math.max(1, items.length);
    const gapRad = (Math.PI / 180) * 6;
    const totalGap = gapRad * n;
    const sector = Math.max(0, (Math.PI * 2 - totalGap) / n);
    const startBase = -Math.PI / 2;

    // outside label sizing
    const labelFont = Math.round(Math.max(14, Math.min(16, minSide * 0.045)));
    const lblR = Rmax + labelOutset * 0.9;

    ctx.save();
    ctx.translate(cx, cy);

    for (let i = 0; i < n; i++) {
      const a0 = startBase + i * (sector + gapRad);
      const a1 = a0 + sector;
      const mid = (a0 + a1) / 2;

      const uOn  = normOn(onVals[i]);
      const uMae = normMae(maeGood[i]);
      const rMae = r0 + (Rmax - r0) * uMae * t;
      const rOn  = r0 + (Rmax - r0) * uOn  * t;

      // Decide z-order so the SMALLER layer is always on top
      const approxEqual = Math.abs(rMae - rOn) <= ORDER_EPS;
      // Stable tiebreaker: prefer green on top when nearly equal
      const topIsGreen = approxEqual ? true : (rOn < rMae);
      const layers = topIsGreen
        ? [
            { key: 'blue',  r: rMae, fill: BLUE_FILL,      alpha: 0.35, stroke: BLUE_STROKE, strokeAlpha: 0.9, strokeWidth: 2.5, hiComp: 'screen' as const, hiAlpha: 0.45 },
            { key: 'green', r: rOn,  fill: PR_COLORS.noteFill, alpha: 0.60, stroke: PR_COLORS.noteStroke, strokeAlpha: 1.0, strokeWidth: 3.0, hiComp: 'hard-light' as const, hiAlpha: 0.75 },
          ] // draw larger first (blue), smaller last (green)
        : [
            { key: 'green', r: rOn,  fill: PR_COLORS.noteFill, alpha: 0.60, stroke: PR_COLORS.noteStroke, strokeAlpha: 1.0, strokeWidth: 3.0, hiComp: 'hard-light' as const, hiAlpha: 0.75 },
            { key: 'blue',  r: rMae, fill: BLUE_FILL,      alpha: 0.35, stroke: BLUE_STROKE, strokeAlpha: 0.9, strokeWidth: 2.5, hiComp: 'screen' as const, hiAlpha: 0.45 },
          ]; // draw larger first (green), smaller last (blue)

      // --- FILLS: draw larger (bottom) then smaller (top) ---
      for (const L of layers) {
        ctx.save();
        ctx.globalAlpha = L.alpha;
        ctx.fillStyle = L.fill;
        ctx.beginPath();
        ctx.arc(0, 0, Math.max(r0, L.r), a0, a1, false);
        ctx.arc(0, 0, r0, a1, a0, true);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }

      // --- RIMS: same order; top (smaller) rim lands last ---
      for (const L of layers) {
        ctx.save();
        ctx.strokeStyle = L.stroke;
        ctx.globalAlpha = L.strokeAlpha;
        ctx.lineWidth = L.strokeWidth;
        ctx.beginPath();
        ctx.arc(0, 0, Math.max(r0, L.r), a0, a1, false);
        ctx.stroke();
        ctx.restore();
      }

      // --- HOVER: overlays stack with the same z-order ---
      if (hover === i) {
        for (const L of layers) {
          ctx.save();
          ctx.globalCompositeOperation = L.hiComp;
          ctx.globalAlpha = L.hiAlpha;
          ctx.fillStyle = L.fill;
          ctx.beginPath();
          ctx.arc(0, 0, Math.max(r0, L.r), a0, a1, false);
          ctx.arc(0, 0, r0, a1, a0, true);
          ctx.closePath();
          ctx.fill();
          ctx.restore();
        }

        // Sheen band only on the TOP (smaller) layer so it reads as the top surface
        const top = layers[1]; // smaller = drawn last
        const sheenInner = r0 + (Rmax - r0) * 0.48;
        const sheenOuter = Math.max(sheenInner + 1, top.r); // cap at top layer radius
        const grad = ctx.createRadialGradient(0, 0, sheenInner, 0, 0, sheenOuter);
        grad.addColorStop(0.00, 'rgba(255,255,255,0.00)');
        grad.addColorStop(0.50, 'rgba(255,255,255,0.40)');
        grad.addColorStop(1.00, 'rgba(255,255,255,0.00)');

        // clip sheen to the top layer's annulus so it never spills under it
        ctx.save();
        ctx.beginPath();
        ctx.arc(0, 0, Math.max(r0, top.r), a0, a1, false);
        ctx.arc(0, 0, r0, a1, a0, true);
        ctx.closePath();
        ctx.clip();

        ctx.globalCompositeOperation = 'screen';
        ctx.globalAlpha = 0.6;
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(0, 0, Math.max(r0, top.r), a0, a1, false);
        ctx.arc(0, 0, r0, a1, a0, true);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }

      // outside note labels
      const rTop = Math.max(rOn, rMae); // for label offset geometry only
      ctx.save();
      ctx.fillStyle = '#0f0f0f';
      ctx.font = `bold ${labelFont}px ui-sans-serif, system-ui`;
      const cosMid = Math.cos(mid), sinMid = Math.sin(mid);
      ctx.textAlign = cosMid > 0 ? 'left' : (cosMid < 0 ? 'right' : 'center');
      ctx.textBaseline = 'middle';
      const x = cosMid * (lblR);
      const y = sinMid * (lblR);
      ctx.fillText(items[i].label, x, y);
      ctx.restore();
    }

    ctx.restore();
  }, [canvasRef, width, sqH, items, max1, max2, t, hover]);

  const onMouseMove = React.useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const c = canvasRef.current; if (!c) return;
    const rect = c.getBoundingClientRect();

    const W = Math.max(1, rect.width);
    const H = Math.max(1, rect.height);
    const minSide = Math.min(W, H);
    if (minSide < 64) { setHover(null); return; }

    const ringPad = 8;
    const labelOutset = Math.max(20, Math.min(30, minSide * 0.05));
    const R = Math.max(ringPad + 12, minSide * 0.5 - ringPad - labelOutset);
    const r0 = Math.max(0, R * 0.20);
    const Rmax = Math.max(r0 + 6, R - ringPad);

    const cx = W / 2, cy = H / 2;
    const x = e.clientX - rect.left, y = e.clientY - rect.top;
    const dx = x - cx, dy = y - cy;
    const r = Math.hypot(dx, dy);

    if (r < r0 - 6 || r > Rmax + 10) { setHover(null); return; }

    const startBase = -Math.PI / 2;
    const ang = Math.atan2(dy, dx);
    let rel = ang - startBase;
    while (rel < 0) rel += Math.PI * 2;
    while (rel >= Math.PI * 2) rel -= Math.PI * 2;

    const n = Math.max(1, items.length);
    const gapRad = (Math.PI / 180) * 6;
    const sector = Math.max(0, (Math.PI * 2 - gapRad * n) / n);
    const cluster = sector + gapRad;

    const idx = Math.floor(rel / cluster);
    const posInCluster = rel - idx * cluster;
    if (idx < 0 || idx >= n || posInCluster > sector) { setHover(null); return; }

    setHover(idx);
  }, [items, canvasRef]);

  const onMouseLeave = React.useCallback(() => { setHover(null); }, []);

  // centered note + metrics
  const center = React.useMemo(() => {
    if (hover == null || !items[hover]) return null;
    const it = items[hover];
    const v1 = clamp(Math.round(it.v1), 0, max1);
    const v2 = clamp(Math.round(it.v2), 0, max2);
    return { label: it.label, v1, v2 };
  }, [hover, items, max1, max2]);

  return (
    <div
      ref={ref}
      className="relative w-full bg-transparent"
      style={{ height: sqH }}
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}
    >
      <canvas
        ref={canvasRef}
        style={{ width: '100%', height: '100%', display: 'block' }}
      />

      {/* Centered info (no bg). Larger note label on row 1. */}
      {center ? (
        <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-center">
          <div className="font-semibold text-[#0f0f0f] text-base sm:text-lg md:text-xl leading-none">
            {center.label}
          </div>
          <div className="mt-1 text-xs font-medium text-[#0f0f0f] flex items-center justify-center gap-3">
            <span className="inline-flex items-center gap-1">
              <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: PR_COLORS.noteFill }} />
              {center.v1}%
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: BLUE_FILL }} />
              {center.v2}¢
            </span>
          </div>
        </div>
      ) : null}
    </div>
  );
}
