// components/home/statsbento/pitch/PolarArea.tsx
'use client';

import * as React from 'react';
import { useMeasure, useCanvas2d } from './hooks';
import { clamp01, clamp, ease } from './utils';
import type { Item } from './types';
import { PR_COLORS } from '@/utils/stage';

const GAMMA = 0.9;

// Solid palette
const GREEN_BASE = '#5ac698';
const BLUE_BASE  = '#b1c9f2';

// Solid highlight colors (no blending)
const GREEN_HI = '#23d794';
const BLUE_HI  = '#84b3f6';

// When radii are nearly equal, keep ordering stable
const ORDER_EPS = 0.75; // px
const TAU = Math.PI * 2;

// Grid styling (match session performance colors)
const GRID_WIDTH_MINOR = 1.0;
const GRID_WIDTH_MAJOR = 1.25;

// Only scale up relative to the dataset max (no min-centering)
const normFromDataset = (vals: number[]): ((v: number) => number) => {
  const finite = vals.filter((x) => Number.isFinite(x));
  const vMax = finite.length ? Math.max(...finite) : 0;

  if (!isFinite(vMax) || vMax <= 1e-6) {
    return (v: number) => Math.pow(clamp01(v), GAMMA);
  }

  const k = vMax < 1 ? 1 / vMax : 1;
  return (v: number) => Math.pow(clamp01(v * k), GAMMA);
};

function fitFontPx(text: string, family: string, weight: string, maxWidth: number, minPx: number, maxPx: number) {
  if (typeof window === 'undefined') return Math.max(minPx, Math.min(maxPx, minPx));
  const cnv = document.createElement('canvas');
  const ctx = cnv.getContext('2d');
  if (!ctx) return Math.max(minPx, Math.min(maxPx, minPx));
  let lo = minPx, hi = maxPx, best = minPx;
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    ctx.font = `${weight} ${mid}px ${family}`;
    const w = ctx.measureText(text).width;
    if (w <= maxWidth) { best = mid; lo = mid + 1; } else { hi = mid - 1; }
  }
  return best;
}

// draw text along a circular arc centered at angle theta
function drawCurvedText(ctx: CanvasRenderingContext2D, text: string, radius: number, theta: number) {
  if (!text) return;
  let totalW = 0;
  for (let i = 0; i < text.length; i++) totalW += ctx.measureText(text[i]).width;
  if (totalW <= 0) return;

  const span = totalW / radius;  // radians covered by the string
  let a = theta - span / 2;      // start angle

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const w = Math.max(0.001, ctx.measureText(ch).width);
    const half = (w / 2) / radius;
    a += half;
    const x = Math.cos(a) * radius;
    const y = Math.sin(a) * radius;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(a + Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(ch, 0, 0);
    ctx.restore();
    a += half;
  }
}

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
  // Bump to force redraws in edge cases
  const [nonce, setNonce] = React.useState(0);

  // Stronger re-draw on window resizes / tab reveals
  React.useEffect(() => {
    const kick = () => setNonce(n => (n + 1) % 1_000_000);
    window.addEventListener('resize', kick);
    window.addEventListener('radials-tab-shown' as any, kick as any);
    return () => {
      window.removeEventListener('resize', kick);
      window.removeEventListener('radials-tab-shown' as any, kick as any);
    };
  }, []);

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

    // CAP: we want 100% fills to TOUCH the outer ring, no gap and no bleed.
    // So fills may reach exactly Rmax; strokes are kept inside by subtracting half their width.
    const Rcap = Rmax;

    const cx = W / 2, cy = Hpx / 2;

    const onVals  = items.map(it => clamp01(it.v1 / max1));
    const maeGood = items.map(it => clamp01(1 - it.v2 / max2));
    const normOn  = normFromDataset(onVals);
    const normMae = normFromDataset(maeGood);

    // sectors
    const n = Math.max(1, items.length);
    const gapRad = (Math.PI / 180) * 6;
    const totalGap = gapRad * n;
    const sector = Math.max(0, (Math.PI * 2 - totalGap) / n);
    const startBase = -Math.PI / 2;

    // label text radius (no background ring)
    const labelFontPx = Math.round(Math.max(11, Math.min(15, minSide * 0.04)));
    const rText = Rmax + labelOutset * 0.85;

    ctx.save();
    ctx.translate(cx, cy);

    /* ───────────────────────────────
       First pass: draw colored sectors
       ─────────────────────────────── */
    const pendingLabels: Array<{ text: string; radius: number; theta: number }> = [];

    for (let i = 0; i < n; i++) {
      const a0 = startBase + i * (sector + gapRad);
      const a1 = a0 + sector;
      const mid = (a0 + a1) / 2;

      const uOn  = normOn(onVals[i]);
      const uMae = normMae(maeGood[i]);
      const rMae = r0 + (Rcap - r0) * uMae * t;
      const rOn  = r0 + (Rcap - r0) * uOn  * t;

      const approxEqual = Math.abs(rMae - rOn) <= ORDER_EPS;
      const topIsGreen = approxEqual ? true : (rOn < rMae);

      const baseGreen = hover === i ? GREEN_HI : GREEN_BASE;
      const baseBlue  = hover === i ? BLUE_HI  : BLUE_BASE;

      const layers = topIsGreen
        ? [
            { r: rMae,  fill: baseBlue,  stroke: baseBlue,  strokeWidth: 2.5 },
            { r: rOn,   fill: baseGreen, stroke: baseGreen, strokeWidth: 3.0 },
          ]
        : [
            { r: rOn,   fill: baseGreen, stroke: baseGreen, strokeWidth: 3.0 },
            { r: rMae,  fill: baseBlue,  stroke: baseBlue,  strokeWidth: 2.5 },
          ];

      // fills (clamped to Rcap; can reach exactly the outer grid radius)
      for (const L of layers) {
        const rOuter = Math.min(Math.max(r0, L.r), Rcap);
        ctx.save();
        ctx.fillStyle = L.fill;
        ctx.beginPath();
        ctx.arc(0, 0, rOuter, a0, a1, false);
        ctx.arc(0, 0, r0, a1, a0, true);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }

      // rims (keep the stroke INSIDE so it never bleeds past the outer grid)
      for (const L of layers) {
        const maxStrokeRadius = Rmax - L.strokeWidth / 2;
        const rEdge = Math.min(Math.max(r0, L.r), maxStrokeRadius);
        ctx.save();
        ctx.strokeStyle = L.stroke;
        ctx.lineWidth = L.strokeWidth;
        ctx.beginPath();
        ctx.arc(0, 0, rEdge, a0, a1, false);
        ctx.stroke();
        ctx.restore();
      }

      // queue labels (draw later, on top of grid)
      pendingLabels.push({ text: items[i].label, radius: rText, theta: mid });
    }

    /* ───────────────────────────────
       Draw the polar grid ON TOP of color
       (0/50/100 major color; 25/75 minor color) — solid lines
       ─────────────────────────────── */
    ctx.save();
    const rings: Array<{ s: number; major: boolean }> = [
      { s: 0.00, major: true  }, // 0%
      { s: 0.25, major: false }, // 25%
      { s: 0.50, major: true  }, // 50%
      { s: 0.75, major: false }, // 75%
      { s: 1.00, major: true  }, // 100%
    ];

    for (const r of rings) {
      ctx.strokeStyle = r.major ? PR_COLORS.gridMajor : PR_COLORS.gridMinor;
      ctx.lineWidth = r.major ? GRID_WIDTH_MAJOR : GRID_WIDTH_MINOR;
      const rr = r0 + (Rmax - r0) * r.s;
      ctx.beginPath();
      ctx.arc(0, 0, rr, 0, TAU);
      ctx.stroke();
    }
    ctx.restore();

    /* ───────────────────────────────
       Finally draw labels above everything
       ─────────────────────────────── */
    ctx.save();
    ctx.fillStyle = '#0f0f0f';
    ctx.font = `bold ${labelFontPx}px ui-sans-serif, system-ui`;
    for (const L of pendingLabels) {
      drawCurvedText(ctx, L.text, L.radius, L.theta);
    }
    ctx.restore();

    ctx.restore();
  }, [canvasRef, width, sqH, items, max1, max2, t, hover, nonce]);

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

    const cx = W / 2, cy = H / 2;
    const x = e.clientX - rect.left, y = e.clientY - rect.top;
    const dx = x - cx, dy = y - cy;
    const r = Math.hypot(dx, dy);

    // generous hover band (no upper cap so labels show even near outer edge)
    if (r < r0 - 6) { setHover(null); return; }

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

  // centered note + metrics (stacked; clamped)
  const center = React.useMemo(() => {
    if (hover == null || !items[hover]) return null;
    const it = items[hover];
    const v1 = clamp(Math.round(it.v1), 0, max1);
    const v2 = clamp(Math.round(it.v2), 0, max2);
    return { label: it.label, v1, v2 };
  }, [hover, items, max1, max2]);

  const centerSizing = React.useMemo(() => {
    const W = Math.max(1, width);
    const H = Math.max(1, sqH);
    const minSide = Math.min(W, H);
    const ringPad = 8;
    const labelOutset = Math.max(20, Math.min(30, minSide * 0.05));
    const R = Math.max(ringPad + 12, minSide * 0.5 - ringPad - labelOutset);
    const r0 = Math.max(0, R * 0.20);

    const maxWidth = Math.max(24, 2 * r0 - 16);
    const maxHeight = Math.max(18, 2 * r0 - 18);
    const family = 'ui-sans-serif, system-ui';

    if (!center) return { maxWidth, labelPx: 11, metricsPx: 9 };

    // a touch smaller for small screens
    const labelMax = Math.round(Math.max(11, Math.min(16, minSide * 0.045)));
    const labelMin = 8;
    const metricsMax = Math.round(Math.max(9, Math.min(12, minSide * 0.03)));
    const metricsMin = 7;

    const v1Str = `${center.v1}%`;
    const v2Str = `${center.v2}¢`;

    let labelPx = fitFontPx(center.label, family, 'bold', maxWidth, labelMin, labelMax);
    let metricsPx = Math.min(
      fitFontPx(v1Str, family, '500', maxWidth, metricsMin, metricsMax),
      fitFontPx(v2Str, family, '500', maxWidth, metricsMin, metricsMax),
    );

    // subtle global downscale
    const globalScale = 0.9;
    labelPx = Math.max(labelMin, Math.floor(labelPx * globalScale));
    metricsPx = Math.max(metricsMin, Math.floor(metricsPx * globalScale));

    // height clamp
    let gap = Math.max(2, Math.round(metricsPx * 0.20));
    const block = labelPx + gap + metricsPx + gap + metricsPx;
    if (block > maxHeight) {
      const k = maxHeight / block;
      labelPx = Math.max(labelMin, Math.floor(labelPx * k));
      metricsPx = Math.max(metricsMin, Math.floor(metricsPx * k));
      gap = Math.max(2, Math.round(metricsPx * 0.20));
    }

    return { maxWidth, labelPx, metricsPx, gap };
  }, [width, sqH, center]);

  return (
    <div
      ref={ref}
      className="relative w-full"
      // Inherit the parent card background to guarantee visual match
      style={{ height: sqH, background: 'inherit' }}
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}
    >
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />

      {center ? (
        <div
          className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-center"
          style={{ maxWidth: centerSizing.maxWidth }}
        >
          <div
            className="font-semibold text-[#0f0f0f] leading-none truncate"
            style={{ fontSize: centerSizing.labelPx }}
            title={center.label}
          >
            {center.label}
          </div>

          {/* stacked metrics: one per row */}
          <div
            className="mt-1 text-[#0f0f0f] flex flex-col items-center justify-center"
            style={{ rowGap: centerSizing.gap, fontWeight: 500 }}
          >
            <div className="inline-flex items-center gap-1" style={{ fontSize: centerSizing.metricsPx }}>
              <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: GREEN_BASE }} />
              {center.v1}%
            </div>
            <div className="inline-flex items-center gap-1" style={{ fontSize: centerSizing.metricsPx }}>
              <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: BLUE_BASE }} />
              {center.v2}¢
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
