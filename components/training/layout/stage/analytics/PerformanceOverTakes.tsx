// components/training/layout/stage/analytics/PerformanceOverTakes.tsx
'use client';

import * as React from 'react';
import type { TakeScore } from '@/utils/scoring/score';
import { PR_COLORS } from '@/utils/stage';

/* ─────────── small utils (copied/lightly adapted from PerformanceCard) ─────────── */
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
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

// D3-like monotoneX with Hyman filter (prevents Bezier overshoot)
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

/* ─────────── types ─────────── */
type Components = {
  pitch?: number;    // %
  melody?: number;   // %
  line?: number;     // %
  intervals?: number;// %
};
type Row = {
  take: number;
  final: number;     // %
  comps: Components;
};

const LINE_WIDTH = 3;
const LINE_COLOR = '#22c55e';
const DOT_FILL = '#86efac';
const DOT_STROKE = '#22c55e';

/* ─────────── inner chart ─────────── */
function LineChart({
  rows,
  height,
  gap = 10,
}: {
  rows: Row[];
  height: number;
  gap?: number;
}) {
  const { ref, width } = useMeasure();
  const { ref: canvasRef } = useCanvas2d(width, height);

  const [t, setT] = React.useState(0);
  React.useEffect(() => {
    let raf = 0; const start = performance.now();
    const tick = (now: number) => { const u = ease((now - start) / 800); setT(u); if (u < 1) raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick); return () => cancelAnimationFrame(raf);
  }, [rows.length]);

  React.useEffect(() => {
    const c = canvasRef.current; if (!c) return;
    const ctx = c.getContext('2d'); if (!ctx) return;
    const W = width, H = height;
    ctx.clearRect(0, 0, W, H);

    // Layout
    const pad = { l: 66, r: 48, t: 10, b: 22 };
    const innerGutter = 16, labelGap = 16;
    const iw = Math.max(10, W - pad.l - pad.r);
    const ih = Math.max(10, H - pad.t - pad.b);
    const baseline = pad.t + ih;
    const plotL = pad.l + innerGutter;
    const plotR = pad.l + iw - innerGutter;
    const plotW = Math.max(10, plotR - plotL);

    // GRID + left Y axis (0..100%)
    const ticks = 4;
    ctx.save();
    ctx.font = '14px ui-sans-serif, system-ui';
    for (let i = 0; i <= ticks; i++) {
      const y = Math.round(pad.t + (ih * i) / ticks) + 0.5;
      const major = i % 2 === 0;
      ctx.strokeStyle = major ? PR_COLORS.gridMajor : PR_COLORS.gridMinor;
      ctx.lineWidth = major ? 1.25 : 0.75;
      ctx.beginPath(); ctx.moveTo(plotL, y); ctx.lineTo(plotR, y); ctx.stroke();

      ctx.fillStyle = '#0f0f0f';
      ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      const val = Math.round((100 * (ticks - i)) / ticks);
      ctx.fillText(`${val}%`, plotL - labelGap, y);
    }
    ctx.restore();

    // Downsample by available width (always keep last)
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

    const n = toDraw.length;
    if (!n) return;

    // Points
    const R_SMALL = 3, R_LATEST = 6;
    const X_MARGIN = 12, Y_MARGIN = 10;

    const xStart = plotL + X_MARGIN;
    const xEnd   = plotR - X_MARGIN;
    const dx = n > 1 ? (xEnd - xStart) / (n - 1) : 0;

    const xs: number[] = new Array(n);
    const ys: number[] = new Array(n);
    for (let i = 0; i < n; i++) {
      const r = toDraw[i];
      const x = xStart + i * dx;
      const yRaw = baseline - ih * clamp01((r.final / 100) * t);
      const y = clamp(yRaw, pad.t + Y_MARGIN, baseline - Y_MARGIN);
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
        cx1y = clamp(cx1y, pad.t, baseline);
        cx2y = clamp(cx2y, pad.t, baseline);
        ctx.bezierCurveTo(cx1x, cx1y, cx2x, cx2y, x2, y2);
      }
    };

    // Clip content
    ctx.save();
    ctx.beginPath(); ctx.rect(plotL, pad.t, plotW, ih); ctx.clip();

    // Area fill
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(xs[0], baseline);
    ctx.lineTo(xs[0], ys[0]);
    for (let i = 0; i < n - 1; i++) {
      const x1 = xs[i], y1 = ys[i], x2 = xs[i+1], y2 = ys[i+1];
      const h = x2 - x1 || 1;
      const cx1x = x1 + h/3; let cx1y = y1 + (m[i]   * h)/3;
      const cx2x = x2 - h/3; let cx2y = y2 - (m[i+1] * h)/3;
      cx1y = clamp(cx1y, pad.t, baseline);
      cx2y = clamp(cx2y, pad.t, baseline);
      ctx.bezierCurveTo(cx1x, cx1y, cx2x, cx2y, x2, y2);
    }
    ctx.lineTo(xs[n - 1], baseline);
    ctx.closePath();

    const grad = ctx.createLinearGradient(0, pad.t, 0, baseline);
    grad.addColorStop(0.00, 'rgba(34,197,94,0.22)');
    grad.addColorStop(0.60, 'rgba(34,197,94,0.10)');
    grad.addColorStop(1.00, 'rgba(34,197,94,0.02)');
    ctx.fillStyle = grad; ctx.fill();

    // Glow
    ctx.beginPath(); traceCurve();
    ctx.lineWidth = LINE_WIDTH + 3;
    ctx.strokeStyle = 'rgba(34,197,94,0.18)';
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.stroke();
    ctx.restore();

    // Line
    ctx.lineWidth = LINE_WIDTH; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.strokeStyle = LINE_COLOR; ctx.beginPath(); traceCurve(); ctx.stroke();

    // Dots
    ctx.fillStyle = DOT_FILL; ctx.strokeStyle = DOT_STROKE;
    for (let i = 0; i < n; i++) {
      ctx.beginPath();
      ctx.arc(xs[i], ys[i], i === n - 1 ? R_LATEST : R_SMALL, 0, Math.PI * 2);
      ctx.fill(); ctx.lineWidth = i === n - 1 ? 2 : 1.5; ctx.stroke();
    }

    ctx.restore();

    // Latest label (no bottom x labels by design)
    const lastX = xs[n - 1], lastY = ys[n - 1];
    const latestVal = Math.round(toDraw[n - 1].final);
    const label = `${latestVal}%`;
    ctx.font = '12px ui-sans-serif, system-ui';
    const tw = ctx.measureText(label).width;
    const rightSpace = W - (lastX + 10);
    const placeLeft = rightSpace < tw + 6;
    ctx.fillStyle = '#0f0f0f'; ctx.textBaseline = 'middle';
    if (placeLeft) { ctx.textAlign = 'right'; ctx.fillText(label, lastX - 10, lastY); }
    else { ctx.textAlign = 'left'; ctx.fillText(label, lastX + 10, lastY); }
  }, [canvasRef, width, height, rows, gap, t]);

  return (
    <div ref={ref} className="relative w-full" style={{ height }} >
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block', borderRadius: 12 }} />
    </div>
  );
}

/* ─────────── exported card ─────────── */
export default function PerformanceOverTakes({ scores }: { scores: TakeScore[] }) {
  const rows: Row[] = React.useMemo(() => {
    return scores.map((s, i) => ({
      take: i + 1,
      final: clamp(s.final.percent, 0, 100),
      comps: {
        pitch: s.pitch.percent,
        melody: s.rhythm.melodyPercent,
        line: s.rhythm.lineEvaluated ? s.rhythm.linePercent : undefined,
        intervals: typeof s.intervals.correctRatio === 'number'
          ? Math.round(s.intervals.correctRatio * 10000) / 100
          : undefined,
      },
    }));
  }, [scores]);

  return (
    <div className="rounded-xl border border-[#dcdcdc] bg-gradient-to-b from-[#f2f2f2] to-[#eeeeee] shadow-sm p-3">
      <div className="text-[11px] uppercase tracking-wide text-[#6b6b6b] mb-2">
        Performance over takes
      </div>
      {/* ~2 bento rows tall */}
      <LineChart rows={rows} height={200} />
    </div>
  );
}
