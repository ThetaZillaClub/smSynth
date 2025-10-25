// components/home/statsbento/PerformanceCard.tsx
'use client';

import * as React from 'react';
import { PR_COLORS } from '@/utils/stage';
import { COURSES } from '@/lib/courses/registry';
import { useHomeResults } from '@/components/home/data/HomeResultsProvider';
import type { HomeResultsCtx } from '@/components/home/data/HomeResultsProvider';

/* ─────────── small utils ─────────── */
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const clamp = (x: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, x));
const ease = (t: number) => 1 - Math.pow(1 - Math.max(0, Math.min(1, t)), 3);
const fmtDay = (iso: string) => { const d = new Date(iso); return `${d.getMonth() + 1}/${d.getDate()}`; };

// lesson title map
const titleByLessonSlug: Record<string, string> = (() => {
  const m: Record<string, string> = {};
  for (const c of COURSES) for (const l of c.lessons) m[l.slug] = l.title;
  return m;
})();

/* ─────────── hooks for canvas ─────────── */
function useMeasure() {
  const ref = React.useRef<HTMLDivElement | null>(null);
  const [box, setBox] = React.useState({ w: 0, h: 0 });
  React.useLayoutEffect(() => {
    const el = ref.current; if (!el) return;
    const ro = new ResizeObserver(() => {
      setBox({ w: el.clientWidth || 0, h: el.clientHeight || 0 });
    });
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
    return () => { window.removeEventListener('resize', h); };
  }, []);
  return dpr;
}
function useCanvas2d(width: number, height: number) {
  const ref = React.useRef<HTMLCanvasElement | null>(null);
  const dpr = useDpr();
  React.useLayoutEffect(() => {
    const c = ref.current; if (!c) return;
    const W = Math.max(1, Math.floor(width)); const H = Math.max(1, Math.floor(height));
    if (c.width !== Math.round(W * dpr) || c.height !== Math.round(H * dpr)) {
      c.width = Math.round(W * dpr); c.height = Math.round(H * dpr);
    }
    const ctx = c.getContext('2d'); if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }, [width, height, dpr]);
  return { ref, dpr };
}

/* ─────────── types ─────────── */
type Components = {
  pitch?: number;    // %
  melody?: number;   // %
  line?: number;     // %
  intervals?: number;// %
};
type Row = {
  ts: string;                // ISO
  day: string;               // M/D
  final: number;             // %
  lessonSlug: string;
  lessonTitle: string;
  comps: Components;
};
type PointHit = { x1: number; x2: number; cx: number; y: number; row: Row };

const SEG_COLOR: Record<keyof Components, string> = {
  pitch:     '#86efac', // green-300
  melody:    '#bbf7d0', // green-200
  line:      '#4ade80', // green-400
  intervals: '#22c55e', // green-500
};

/* ─────────── line chart ─────────── */
const LINE_WIDTH = 3;          // keep 3px stroke
const LINE_COLOR = '#22c55e';  // dark green
const DOT_FILL = '#86efac';    // light green
const DOT_STROKE = '#22c55e';  // dark green

// D3-like monotoneX slopes with Hyman filtering (prevents Bezier overshoot)
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

function PerformanceLine({
  rows,
  height,          // if omitted, fills parent via ResizeObserver
  gap = 10,
}: {
  rows: Row[];
  height?: number;
  gap?: number;
}) {
  const { ref, width, height: measuredH } = useMeasure();
  const H = Math.max(1, height ?? (measuredH || 240));
  const { ref: canvasRef } = useCanvas2d(width, H);

  const [t, setT] = React.useState(0);                 // intro animation
  const [hoverIdx, setHoverIdx] = React.useState<number | null>(null);
  const [animPrevIdx, setAnimPrevIdx] = React.useState<number | null>(null);
  const [animU, setAnimU] = React.useState(1);         // 0..1 between prev and current hover

  const [tip, setTip] = React.useState<{
    x: number; y: number; title: string; day: string; final: number; comps: Components;
  } | null>(null);

  const hitsRef = React.useRef<PointHit[]>([]);
  const lastHoverRef = React.useRef<number | null>(null);

  // intro anim
  React.useEffect(() => {
    let raf = 0; const start = performance.now();
    const tick = (now: number) => { const u = ease((now - start) / 800); setT(u); if (u < 1) raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick); return () => cancelAnimationFrame(raf);
  }, [rows.length]);

  // hover transition anim (smooth grow/shrink between points)
  React.useEffect(() => {
    const prev = lastHoverRef.current;
    if (prev === hoverIdx) return;
    lastHoverRef.current = hoverIdx;
    setAnimPrevIdx(prev);
    setAnimU(0);

    let raf = 0;
    const start = performance.now();
    const duration = 200;
    const tick = (now: number) => {
      const p = clamp01((now - start) / duration);
      setAnimU(ease(p));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [hoverIdx]);

  React.useEffect(() => {
    const c = canvasRef.current; if (!c) return;
    const ctx = c.getContext('2d'); if (!ctx) return;
    const W = width, Hh = H;
    ctx.clearRect(0, 0, W, Hh);

    // Layout
    const pad = { l: 66, r: 48, t: 10, b: 22 };
    const innerGutter = 16, labelGap = 16;
    const iw = Math.max(10, W - pad.l - pad.r);
    const ih = Math.max(10, Hh - pad.t - pad.b);
    const baseline = pad.t + ih;

    // Plot rect
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

    // Downsample by available width (always keep latest)
    const MIN_GAP = Math.max(6, gap);
    const capacity = Math.max(2, Math.floor(plotW / MIN_GAP));
    let toDraw: Row[] = rows;
    if (rows.length > capacity) {
      const step = Math.ceil(rows.length / capacity);
      const sampled: Row[] = [];
      for (let i = 0; i < rows.length; i += step) sampled.push(rows[i]);
      if (sampled[sampled.length - 1]?.ts !== rows[rows.length - 1]?.ts) {
        sampled[sampled.length - 1] = rows[rows.length - 1];
      }
      toDraw = sampled;
    }
    const n = toDraw.length;
    if (!n) { hitsRef.current = []; return; }

    // Keep dots inside edges + give room for stroke
    const R_SMALL = 3, R_HOVER = 7;
    const R_LATEST = 6, R_LATEST_HOVER = 9;
    const X_MARGIN = Math.max(R_LATEST_HOVER, 10);
    const Y_MARGIN = Math.max(R_LATEST_HOVER, 10);

    const xStart = plotL + X_MARGIN;
    const xEnd   = plotR - X_MARGIN;
    const dx = n > 1 ? (xEnd - xStart) / (n - 1) : 0;

    const xs: number[] = new Array(n);
    const ys: number[] = new Array(n);
    const pts: { x: number; y: number; r: Row }[] = [];
    for (let i = 0; i < n; i++) {
      const r = toDraw[i];
      const x = xStart + i * dx;
      const yRaw = baseline - ih * clamp01((r.final / 100) * t);
      const y = clamp(yRaw, pad.t + Y_MARGIN, baseline - Y_MARGIN);
      xs[i] = x; ys[i] = y; pts.push({ x, y, r });
    }

    // Monotone slopes (no overshoot)
    const m = computeMonotoneSlopes(xs, ys);

    // Helper to trace the curve
    const traceCurve = () => {
      ctx.moveTo(xs[0], ys[0]);
      for (let i = 0; i < n - 1; i++) {
        const x1 = xs[i],   y1 = ys[i];
        const x2 = xs[i+1], y2 = ys[i+1];
        const h = x2 - x1 || 1;

        const cx1x = x1 + h/3;
        let   cx1y = y1 + (m[i]   * h)/3;
        const cx2x = x2 - h/3;
        let   cx2y = y2 - (m[i+1] * h)/3;

        cx1y = clamp(cx1y, pad.t, baseline);
        cx2y = clamp(cx2y, pad.t, baseline);

        ctx.bezierCurveTo(cx1x, cx1y, cx2x, cx2y, x2, y2);
      }
    };

    // Clip for chart content (labels drawn after)
    ctx.save();
    ctx.beginPath(); ctx.rect(plotL, pad.t, plotW, ih); ctx.clip();

    /* ───── Elegant translucent area fill under the line ───── */
    if (n >= 1) {
      ctx.save();
      // Build a closed path from baseline → curve → baseline
      ctx.beginPath();
      ctx.moveTo(xs[0], baseline);
      ctx.lineTo(xs[0], ys[0]);
      for (let i = 0; i < n - 1; i++) {
        const x1 = xs[i],   y1 = ys[i];
        const x2 = xs[i+1], y2 = ys[i+1];
        const h = x2 - x1 || 1;

        const cx1x = x1 + h/3;
        let   cx1y = y1 + (m[i]   * h)/3;
        const cx2x = x2 - h/3;
        let   cx2y = y2 - (m[i+1] * h)/3;

        cx1y = clamp(cx1y, pad.t, baseline);
        cx2y = clamp(cx2y, pad.t, baseline);

        ctx.bezierCurveTo(cx1x, cx1y, cx2x, cx2y, x2, y2);
      }
      ctx.lineTo(xs[n - 1], baseline);
      ctx.closePath();

      // Vertical gradient that softly fades to transparent at the baseline
      const grad = ctx.createLinearGradient(0, pad.t, 0, baseline);
      grad.addColorStop(0.00, 'rgba(34,197,94,0.22)');
      grad.addColorStop(0.60, 'rgba(34,197,94,0.10)');
      grad.addColorStop(1.00, 'rgba(34,197,94,0.02)');
      ctx.fillStyle = grad;
      ctx.fill();

      // Gentle glow just under the curve
      ctx.beginPath();
      traceCurve();
      ctx.lineWidth = LINE_WIDTH + 3;
      ctx.strokeStyle = 'rgba(34,197,94,0.18)';
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.stroke();

      ctx.restore();
    }

    // Smooth dark-green line (rounded)
    ctx.lineWidth = LINE_WIDTH;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.strokeStyle = LINE_COLOR;
    ctx.beginPath();
    traceCurve();
    ctx.stroke();

    // Dots (light fill + dark stroke) with smooth cross-fade sizing
    ctx.fillStyle = DOT_FILL;
    ctx.strokeStyle = DOT_STROKE;
    for (let i = 0; i < n; i++) {
      const p = pts[i];
      const isLatest = i === n - 1;

      // Use the defined radius constants to avoid unused-var warnings
      const base = isLatest ? R_LATEST : R_SMALL;
      const target = isLatest ? R_LATEST_HOVER : R_HOVER;

      // animated amplitude for this point
      let amp = 0;
      if (hoverIdx != null && animPrevIdx == null) {
        amp = i === hoverIdx ? animU : 0;
      } else if (hoverIdx == null && animPrevIdx != null) {
        amp = i === animPrevIdx ? 1 - animU : 0;
      } else if (hoverIdx != null && animPrevIdx != null) {
        amp = i === hoverIdx ? animU : (i === animPrevIdx ? 1 - animU : 0);
      }
      const r = base + (target - base) * clamp01(amp);

      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = isLatest ? 2 : 1.5;
      ctx.stroke();
    }

    ctx.restore(); // end clip

    // Latest value label outside clip (auto-flip to stay on-canvas)
    const lastX = xs[n - 1], lastY = ys[n - 1];
    const latestVal = Math.round(toDraw[n - 1].final);
    const label = `${latestVal}%`;
    ctx.font = '12px ui-sans-serif, system-ui';
    const tw = ctx.measureText(label).width;
    const rightSpace = W - (lastX + 10);
    const placeLeft = rightSpace < tw + 6;

    ctx.fillStyle = '#0f0f0f';
    ctx.textBaseline = 'middle';
    if (placeLeft) { ctx.textAlign = 'right'; ctx.fillText(label, lastX - 10, lastY); }
    else { ctx.textAlign = 'left'; ctx.fillText(label, lastX + 10, lastY); }

    // Build hover hit zones (midpoint splits)
    const half = Math.max(6, (n > 1 ? (xs[1] - xs[0]) : 12) / 2);
    hitsRef.current = xs.map((x, i) => {
      const left  = i === 0     ? x - half : (x + xs[i - 1]) / 2;
      const right = i === n - 1 ? x + half : (x + xs[i + 1]) / 2;
      return { cx: x, x1: left, x2: right, y: ys[i], row: toDraw[i] };
    });
  }, [canvasRef, width, H, rows, gap, t, hoverIdx, animPrevIdx, animU]);

  // hover + tooltip
  const onMouseMove = React.useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    let idx: number | null = null;
    for (let i = 0; i < hitsRef.current.length; i++) {
      const h = hitsRef.current[i];
      if (x >= h.x1 && x <= h.x2) { idx = i; break; }
    }
    setHoverIdx(idx);
    if (idx != null) {
      const h = hitsRef.current[idx];
      setTip({
        x: clamp(h.cx, 8, rect.width - 8),
        y: Math.max(12, h.y - 14),
        title: h.row.lessonTitle,
        day: h.row.day,
        final: Math.round(h.row.final),
        comps: h.row.comps,
      });
    } else {
      setTip(null);
    }
  }, []);
  const onMouseLeave = React.useCallback(() => { setHoverIdx(null); setTip(null); }, []);

  return (
    <div
      ref={ref}
      className="relative w-full"
      style={{ height: height ?? '100%' }}
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}
    >
      <canvas
        ref={canvasRef}
        style={{ width: '100%', height: '100%', display: 'block', borderRadius: 12 }}
      />
      {tip ? (
        <div
          className="pointer-events-none absolute -translate-x-1/2 -translate-y-full rounded-lg border bg-white px-2.5 py-1.5 text-xs font-medium shadow-md"
          style={{
            left: tip.x,
            top: tip.y,
            borderColor: '#e5e7eb',
            color: '#0f0f0f',
            whiteSpace: 'nowrap',
          }}
        >
          <div className="flex flex-col gap-1">
            <div className="font-semibold">{tip.title}</div>
            <div className="opacity-70">{tip.day}</div>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: LINE_COLOR }} />
              Final: {tip.final}%
            </div>
            <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 mt-0.5">
              {'pitch' in tip.comps && tip.comps.pitch != null ? (
                <div className="flex items-center gap-1">
                  <span className="inline-block h-2 w-2 rounded-sm" style={{ background: SEG_COLOR.pitch }} />
                  Pitch: {Math.round(tip.comps.pitch!)}%
                </div>
              ) : null}
              {'melody' in tip.comps && tip.comps.melody != null ? (
                <div className="flex items-center gap-1">
                  <span className="inline-block h-2 w-2 rounded-sm" style={{ background: SEG_COLOR.melody }} />
                  Melody: {Math.round(tip.comps.melody!)}%
                </div>
              ) : null}
              {'line' in tip.comps && tip.comps.line != null ? (
                <div className="flex items-center gap-1">
                  <span className="inline-block h-2 w-2 rounded-sm" style={{ background: SEG_COLOR.line }} />
                  Rhythm: {Math.round(tip.comps.line!)}%
                </div>
              ) : null}
              {'intervals' in tip.comps && tip.comps.intervals != null ? (
                <div className="flex items-center gap-1">
                  <span className="inline-block h-2 w-2 rounded-sm" style={{ background: SEG_COLOR.intervals }} />
                  Intervals: {Math.round(tip.comps.intervals!)}%
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/* ─────────── card ─────────── */
export default function PerformanceCard() {
  const { rows: baseRows, loading: baseLoading, error: baseErr } = useHomeResults();

  const rows = React.useMemo<Row[]>(() => {
    return (baseRows ?? []).map((r: HomeResultsCtx['rows'][number]) => {
      const ts = new Date(r.created_at).toISOString();
      const slug = String(r.lesson_slug || '');
      const comps: Components = {
        pitch: typeof r.pitch_percent === 'number' && Number.isFinite(r.pitch_percent) ? r.pitch_percent : undefined,
        melody: typeof r.rhythm_melody_percent === 'number' && Number.isFinite(r.rhythm_melody_percent) ? r.rhythm_melody_percent : undefined,
        line: typeof r.rhythm_line_percent === 'number' && Number.isFinite(r.rhythm_line_percent) ? r.rhythm_line_percent : undefined,
        intervals: typeof r.intervals_correct_ratio === 'number' && Number.isFinite(r.intervals_correct_ratio)
          ? Math.round(r.intervals_correct_ratio * 10000) / 100
          : undefined,
      };
      return {
        ts,
        day: fmtDay(ts),
        final: clamp(Number(r.final_percent ?? 0), 0, 100),
        lessonSlug: slug,
        lessonTitle: (titleByLessonSlug[slug] ?? (slug || 'Unknown Lesson')),
        comps,
      };
    });
  }, [baseRows]);

  return (
    <div className="h-full rounded-2xl border border-[#d2d2d2] bg-gradient-to-b from-[#f2f2f2] to-[#eeeeee] p-6 shadow-sm flex flex-col">
      {/* Header */}
      <div className="flex items-baseline justify-between gap-3 mb-16">
        <h3 className="text-2xl font-semibold text-[#0f0f0f]">Recent Performances</h3>
      </div>

      {/* Body fills remaining space so the whole card matches its grid cell exactly */}
      <div className="flex-1 min-h-0">
        {baseLoading ? (
          <div className="h-full min-h-[240px] rounded-xl bg-[#e8e8e8] animate-pulse" />
        ) : rows.length === 0 ? (
          <div className="h-full min-h-[240px] grid place-items-center text-base text-[#0f0f0f] rounded-xl bg-[#f5f5f5]">
            No sessions yet — run an exercise to unlock your dashboard.
          </div>
        ) : (
          // Height is measured from this container (fills remaining space)
          <div className="h-full">
            <PerformanceLine rows={rows} />
          </div>
        )}
      </div>

      {baseErr ? <div className="mt-3 text-sm text-[#dc2626]">{baseErr}</div> : null}
    </div>
  );
}
