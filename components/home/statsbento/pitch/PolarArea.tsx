'use client';

import * as React from 'react';
import { PR_COLORS } from '@/utils/stage';
import { useMeasure, useCanvas2d } from './hooks';
import { clamp01, clamp, ease } from './utils';
import type { Item } from './types';

const GAMMA = 0.9;

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
  const sqH = (width > 0 ? width : height);
  const { ref: canvasRef } = useCanvas2d(width, sqH);

  const [t, setT] = React.useState(0);
  const [hover, setHover] = React.useState<number | null>(null);
  const [tip, setTip] = React.useState<{ x: number; y: number; label: string; v1: number; v2: number } | null>(null);

  React.useEffect(() => {
    let raf = 0; const start = performance.now();
    const tick = (now: number) => { const u = ease((now - start) / 800); setT(u); if (u < 1) raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick); return () => cancelAnimationFrame(raf);
  }, [items.length]);

  React.useEffect(() => {
    const c = canvasRef.current; if (!c) return;
    const ctx = c.getContext('2d'); if (!ctx) return;

    const W = Math.max(1, width);
    const Hpx = Math.max(1, sqH);
    ctx.clearRect(0, 0, W, Hpx);

    const minSide = Math.min(W, Hpx);
    if (minSide < 64) return;

    const ringPad = 8;
    const R = Math.max(ringPad + 12, minSide * 0.5 - ringPad);
    const r0 = Math.max(0, R * 0.20);
    const Rmax = Math.max(r0 + 6, R - ringPad);

    const cx = W / 2, cy = Hpx / 2;

    const onVals  = items.map(it => clamp01(it.v1 / max1));
    const maeGood = items.map(it => clamp01(1 - it.v2 / max2));
    const normOn  = normFromDataset(onVals);
    const normMae = normFromDataset(maeGood);

    // circular background fill
    ctx.save();
    ctx.fillStyle = '#f4f4f4';
    ctx.beginPath();
    ctx.arc(cx, cy, Rmax /* push to the edge */, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // background rings (alternating styles)
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

    const labelPad = Math.max(20, Math.min(30, minSide * 0.05));
    const labelFont = Math.round(Math.max(14, Math.min(16, minSide * 0.045)));

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

      if (hover === i) {
        ctx.save();
        ctx.fillStyle = 'rgba(16,24,40,0.06)';
        ctx.beginPath();
        ctx.arc(0, 0, Rmax + 4, a0, a1, false);
        ctx.arc(0, 0, Math.max(0, r0 - 4), a1, a0, true);
        ctx.closePath(); ctx.fill();
        ctx.restore();
      }

      // MAE layer (blue)
      ctx.save();
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = '#3b82f6';
      ctx.beginPath();
      ctx.arc(0, 0, Math.max(r0, rMae), a0, a1, false);
      ctx.arc(0, 0, r0, a1, a0, true);
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      // On-pitch layer
      ctx.save();
      ctx.globalAlpha = 0.60;
      ctx.fillStyle = PR_COLORS.noteFill;
      ctx.beginPath();
      ctx.arc(0, 0, Math.max(r0, rOn), a0, a1, false);
      ctx.arc(0, 0, r0, a1, a0, true);
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      // rim
      ctx.save();
      ctx.strokeStyle = PR_COLORS.noteStroke;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, Math.max(r0, rOn), a0, a1, false);
      ctx.stroke();
      ctx.restore();

      // label
      const lblR = Rmax - labelPad;
      ctx.save();
      ctx.fillStyle = '#0f0f0f';
      ctx.font = `bold ${labelFont}px ui-sans-serif, system-ui`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(items[i].label, Math.cos(mid) * lblR, Math.sin(mid) * lblR);
      ctx.restore();
    }

    // focus ring
    if (hover != null) {
      const i = hover;
      const a0 = startBase + i * (sector + gapRad);
      const a1 = a0 + sector;
      ctx.save();
      ctx.strokeStyle = 'rgba(16,24,40,0.25)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, Rmax + 5, a0, a1, false);
      ctx.arc(0, 0, Math.max(0, r0 - 5), a1, a0, true);
      ctx.closePath();
      ctx.stroke();
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
    if (minSide < 64) { setHover(null); setTip(null); return; }

    const ringPad = 8;
    const R = Math.max(ringPad + 12, minSide * 0.5 - ringPad);
    const r0 = Math.max(0, R * 0.20);
    const Rmax = Math.max(r0 + 6, R - ringPad);

    const cx = W / 2, cy = H / 2;
    const x = e.clientX - rect.left, y = e.clientY - rect.top;
    const dx = x - cx, dy = y - cy;
    const r = Math.hypot(dx, dy);

    if (r < r0 - 6 || r > Rmax + 10) { setHover(null); setTip(null); return; }

    const startBase = -Math.PI / 2;
    let ang = Math.atan2(dy, dx);
    let rel = ang - startBase;
    while (rel < 0) rel += Math.PI * 2;
    while (rel >= Math.PI * 2) rel -= Math.PI * 2;

    const n = Math.max(1, items.length);
    const gapRad = (Math.PI / 180) * 6;
    const sector = Math.max(0, (Math.PI * 2 - gapRad * n) / n);
    const cluster = sector + gapRad;

    const idx = Math.floor(rel / cluster);
    const posInCluster = rel - idx * cluster;
    if (idx < 0 || idx >= n || posInCluster > sector) { setHover(null); setTip(null); return; }

    setHover(idx);

    const onVals  = items.map(it => clamp01(it.v1 / max1));
    const normOn  = normFromDataset(onVals);
    const it = items[idx];
    const uOn = normOn(onVals[idx]);
    const Rdraw = r0 + (Rmax - r0) * uOn;

    const mid = (startBase + idx * cluster) + sector / 2;
    const tipX = clamp(cx + Math.cos(mid) * (Rdraw + 12), 8, W - 8);
    const tipY = clamp(cy + Math.sin(mid) * (Rdraw + 12), 8, H - 8);

    setTip({
      x: tipX,
      y: tipY,
      label: it.label,
      v1: clamp(Math.round(it.v1), 0, max1),
      v2: clamp(Math.round(it.v2), 0, max2),
    });
  }, [items, max1, max2, canvasRef]);

  const onMouseLeave = React.useCallback(() => { setHover(null); setTip(null); }, []);

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
        style={{ width: '100%', height: '100%', display: 'block', borderRadius: '50%' }}
      />
      {tip ? (
        <div
          className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded-lg border bg-white px-2.5 py-1.5 text-xs font-medium shadow-md"
          style={{
            left: tip.x,
            top: tip.y,
            borderColor: '#e5e7eb',
            color: '#0f0f0f',
            whiteSpace: 'nowrap',
          }}
        >
          <div className="flex items-center gap-2">
            <span className="font-semibold">{tip.label}</span>
            <span className="inline-flex items-center gap-1">
              <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: PR_COLORS.noteFill }} />
              {tip.v1}%
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: '#3b82f6' }} />
              {tip.v2}¢
            </span>
          </div>
        </div>
      ) : null}
    </div>
  );
}
