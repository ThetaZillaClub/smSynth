// components/training/layout/stage/analytics/PerformanceOverTakes.tsx
'use client';

import * as React from 'react';
import type { TakeScore } from '@/utils/scoring/score';
import { ANA_COLORS } from './colors'; // match MultiSeriesLines grid styling

/* ─────────── small utils ─────────── */
const clamp = (x: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, x));
const ease = (t: number) => 1 - Math.pow(1 - Math.max(0, Math.min(1, t)), 3);

function useMeasure() {
  const ref = React.useRef<HTMLDivElement | null>(null);
  const [box, setBox] = React.useState({ w: 0, h: 0 });
  React.useLayoutEffect(() => {
    const el = ref.current; if (!el) return;
    const ro = new ResizeObserver(() => setBox({ w: el.clientWidth || 0, h: el.clientHeight || 0 }));
    ro.observe(el);
    setBox({ w: el.clientWidth || 0, h: el.clientHeight || 0 });
    return () => ro.disconnect();
  }, []);
  return { ref, width: box.w, height: box.h };
}
function useDpr() {
  const [dpr, setDpr] = React.useState(typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1);
  React.useEffect(() => {
    const h = () => setDpr(window.devicePixelRatio || 1);
    window.addEventListener('resize', h);
    return () => window.removeEventListener('resize', h);
  }, []);
  return dpr;
}
function useCanvas2d(width: number, height: number) {
  const ref = React.useRef<HTMLCanvasElement | null>(null);
  const dpr = useDpr();
  React.useLayoutEffect(() => {
    const c = ref.current; if (!c) return;
    const W = Math.max(1, Math.floor(width));
    const H = Math.max(1, Math.floor(height));
    if (c.width !== Math.round(W * dpr) || c.height !== Math.round(H * dpr)) {
      c.width = Math.round(W * dpr);
      c.height = Math.round(H * dpr);
    }
    const ctx = c.getContext('2d'); if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }, [width, height, dpr]);
  return { ref, dpr };
}

// Monotone cubic with Hyman filter (no overshoot)
function computeMonotoneSlopes(xs: number[], ys: number[]) {
  const n = xs.length;
  const ms = new Array<number>(n).fill(0);
  if (n < 2) return ms;

  const dx: number[] = new Array(n - 1);
  const s: number[] = new Array(n - 1);
  for (let i = 0; i < n - 1; ++i) {
    dx[i] = xs[i + 1] - xs[i] || 1;
    s[i] = (ys[i + 1] - ys[i]) / dx[i];
  }

  ms[0] = s[0];
  for (let i = 1; i < n - 1; ++i) {
    ms[i] = (s[i - 1] * s[i] <= 0) ? 0 : (s[i - 1] + s[i]) / 2;
  }
  ms[n - 1] = s[n - 2];

  for (let i = 0; i < n - 1; ++i) {
    if (s[i] === 0) { ms[i] = 0; ms[i + 1] = 0; continue; }
    const a = ms[i] / s[i];
    const b = ms[i + 1] / s[i];
    const r = a * a + b * b;
    if (r > 9) {
      const t = 3 / Math.sqrt(r);
      ms[i] = t * a * s[i];
      ms[i + 1] = t * b * s[i];
    }
  }
  return ms;
}

/* ─────────── types/consts ─────────── */
type Row = { take: number; final: number };

const LINE_WIDTH = 2.5;               // match MultiSeriesLines
const LINE_COLOR = '#22c55e';
const DOT_R = 3.5;                    // match MultiSeriesLines
const DOT_STROKE = '#22c55e';
const DOT_FILL = 'rgba(34,197,94,0.18)';

function LineChart({
  rows,
  height,
  gap = 10,
}: {
  rows: Row[];
  height: number | string;
  gap?: number;
}) {
  const { ref, width, height: hostH } = useMeasure();
  const { ref: canvasRef } = useCanvas2d(width, typeof hostH === 'number' ? hostH : 0);

  const [t, setT] = React.useState(0);
  React.useEffect(() => {
    let raf = 0; const start = performance.now();
    const tick = (now: number) => { const u = ease((now - start) / 800); setT(u); if (u < 1) raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick); return () => cancelAnimationFrame(raf);
  }, [rows.length]);

  React.useEffect(() => {
    const c = canvasRef.current; if (!c) return;
    const ctx = c.getContext('2d'); if (!ctx) return;
    const W = width, H = hostH;
    ctx.clearRect(0, 0, W, H);

    // ─── Layout: identical paddings to MultiSeriesLines ───
    const pad = { l: 56, r: 18, t: 10, b: 20 };
    const iw = Math.max(10, W - pad.l - pad.r);
    const ih = Math.max(10, H - pad.t - pad.b);
    const x0 = pad.l;
    const baseline = pad.t + ih;

    // Y grid + labels (font/weights/colors match MultiSeriesLines)
    const yTicks = 4;
    ctx.save();
    ctx.font = '12px ui-sans-serif, system-ui';
    for (let i = 0; i <= yTicks; i++) {
      const y = Math.round(pad.t + (ih * i) / yTicks) + 0.5;
      const major = i % 2 === 0;
      ctx.strokeStyle = major ? ANA_COLORS.gridMajor : ANA_COLORS.gridMinor;
      ctx.lineWidth = major ? 1.25 : 0.75;
      ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x0 + iw, y); ctx.stroke();

      ctx.fillStyle = '#0f0f0f';
      ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      const val = Math.round((100 * (yTicks - i)) / yTicks);
      ctx.fillText(`${val}%`, x0 - 10, y);
    }
    ctx.restore();

    // X range (same ±8px as Multi for the curve itself)
    const X_MARGIN = 8;
    const xStart = x0 + X_MARGIN;
    const xEnd   = x0 + iw - X_MARGIN;
    const dx = rows.length > 1 ? (xEnd - xStart) / (rows.length - 1) : 0;

    // Downsample capacity uses the actual plot width between xStart..xEnd
    const plotW = Math.max(10, xEnd - xStart);
    const MIN_GAP = Math.max(6, gap);
    const capacity = Math.max(2, Math.floor(plotW / MIN_GAP));
    let toDraw = rows;
    if (rows.length > capacity) {
      const step = Math.ceil(rows.length / capacity);
      const sampled: Row[] = [];
      for (let i = 0; i < rows.length; i += step) sampled.push(rows[i]);
      if (sampled[sampled.length - 1]?.take !== rows[rows.length - 1]?.take) {
        sampled[sampled.length - 1] = rows[rows.length - 1];
      }
      toDraw = sampled;
    }

    const n = toDraw.length; if (!n) return;

    // Points
    const Y_MARGIN = 10;
    const xs: number[] = new Array(n);
    const ys: number[] = new Array(n);
    for (let i = 0; i < n; i++) {
      const r = toDraw[i];
      const x = xStart + i * dx;
      const yRaw = baseline - ih * clamp((r.final / 100) * t, 0, 1);
      const y = Math.max(pad.t + Y_MARGIN, Math.min(baseline - Y_MARGIN, yRaw));
      xs[i] = x; ys[i] = y;
    }

    const m = computeMonotoneSlopes(xs, ys);
    const traceCurve = () => {
      ctx.moveTo(xs[0], ys[0]);
      for (let i = 0; i < n - 1; i++) {
        const x1 = xs[i],   y1 = ys[i];
        const x2 = xs[i+1], y2 = ys[i+1];
        const h = x2 - x1 || 1;
        const cx1x = x1 + h/3; let cx1y = y1 + (m[i]   * h)/3;
        const cx2x = x2 - h/3; let cx2y = y2 - (m[i+1] * h)/3;
        ctx.bezierCurveTo(
          cx1x, Math.max(pad.t, Math.min(baseline, cx1y)),
          cx2x, Math.max(pad.t, Math.min(baseline, cx2y)),
          x2, y2
        );
      }
    };

    // Clip to the exact plot area (no extra gutter)
    ctx.save();
    ctx.beginPath(); ctx.rect(x0, pad.t, iw, ih); ctx.clip();

    // Area fill (consistent green gradient)
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(xs[0], baseline);
    ctx.lineTo(xs[0], ys[0]);
    for (let i = 0; i < n - 1; i++) {
      const x1 = xs[i], y1 = ys[i], x2 = xs[i+1], y2 = ys[i+1];
      const h = x2 - x1 || 1;
      const cx1x = x1 + h/3; let cx1y = y1 + (m[i]   * h)/3;
      const cx2x = x2 - h/3; let cx2y = y2 - (m[i+1] * h)/3;
      ctx.bezierCurveTo(
        cx1x, Math.max(pad.t, Math.min(baseline, cx1y)),
        cx2x, Math.max(pad.t, Math.min(baseline, cx2y)),
        x2, y2
      );
    }
    ctx.lineTo(xs[n - 1], baseline);
    ctx.closePath();

    const grad = ctx.createLinearGradient(0, pad.t, 0, baseline);
    grad.addColorStop(0.00, 'rgba(34,197,94,0.22)');
    grad.addColorStop(0.60, 'rgba(34,197,94,0.10)');
    grad.addColorStop(1.00, 'rgba(34,197,94,0.02)');
    ctx.fillStyle = grad; ctx.fill();
    ctx.restore();

    // Line (no glow; match MultiSeriesLines)
    ctx.lineWidth = LINE_WIDTH; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.strokeStyle = LINE_COLOR; ctx.beginPath(); traceCurve(); ctx.stroke();

    // Dots (match MultiSeriesLines)
    ctx.fillStyle = DOT_FILL; ctx.strokeStyle = DOT_STROKE;
    for (let i = 0; i < n; i++) {
      ctx.beginPath();
      ctx.arc(xs[i], ys[i], DOT_R, 0, Math.PI * 2);
      ctx.fill(); ctx.lineWidth = 1.75; ctx.stroke();
    }

    ctx.restore();
  }, [canvasRef, width, hostH, rows, gap, t]);

  // TS-safe style object
  const chartStyle: React.CSSProperties = {};
  if (typeof height === 'number' || typeof height === 'string') chartStyle.height = height;

  return (
    <div ref={ref} className="relative w-full" style={chartStyle} >
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block', borderRadius: 12 }} />
    </div>
  );
}

/* ─────────── exported: symmetric top/bottom rhythm ─────────── */
export default function PerformanceOverTakes({
  scores,
  height = 200,
  reserveLegendRow = true,
  legendRowHeight = 26,     // ~chip height
  legendGapPx = 8,          // Tailwind mt-2
  reserveTopGutter = true,  // add same space above chart
}: {
  scores: TakeScore[];
  height?: number | string;
  reserveLegendRow?: boolean;
  legendRowHeight?: number;
  legendGapPx?: number;
  reserveTopGutter?: boolean;
}) {
  const rows: Row[] = React.useMemo(
    () => scores.map((s, i) => ({ take: i + 1, final: clamp(s.final.percent, 0, 100) })),
    [scores]
  );

  return (
    <div className="h-full min-h-0 overflow-hidden flex flex-col p-0">
      {/* Top spacer to mirror the legend row below */}
      {reserveTopGutter ? (
        <div className="shrink-0" style={{ height: legendRowHeight + legendGapPx }} aria-hidden />
      ) : null}

      <div className="relative w-full flex-1 min-h-0">
        <LineChart rows={rows} height={height} />
      </div>

      {/* Fake legend row to keep vertical rhythm identical */}
      {reserveLegendRow ? (
        <div className="mt-2 flex flex-wrap gap-2" aria-hidden>
          <div style={{ height: legendRowHeight }} />
        </div>
      ) : null}
    </div>
  );
}
