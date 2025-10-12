// components/home/statsbento/PerformanceCard.tsx
'use client';

import * as React from 'react';
import { createClient } from '@/lib/supabase/client';
import { ensureSessionReady } from '@/lib/client-cache';
import { PR_COLORS } from '@/utils/stage';
import { COURSES } from '@/lib/courses/registry';

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
  const [w, setW] = React.useState(0);
  React.useLayoutEffect(() => {
    const el = ref.current; if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth || 0));
    ro.observe(el); setW(el.clientWidth || 0);
    return () => ro.disconnect();
  }, []);
  return { ref, width: w };
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

/* ─────────── chart ─────────── */
type Components = {
  pitch?: number;    // %
  melody?: number;   // %
  line?: number;     // %
  intervals?: number;// %
};

type Row = {
  ts: string;                // ISO
  day: string;               // M/D (not rendered on axis; used in tooltip)
  final: number;             // %
  lessonSlug: string;
  lessonTitle: string;
  comps: Components;
};

type Hit = { x1: number; x2: number; cx: number; top: number; h: number; row: Row };

const SEG_COLOR: Record<keyof Components, string> = {
  pitch:     '#86efac', // green-300
  melody:    '#bbf7d0', // green-200
  line:      '#4ade80', // green-400
  intervals: '#22c55e', // green-500
};

function VerticalTimeBars({
  rows,
  height = 360,
  stickW = 12,
  gap = 12,
}: {
  rows: Row[];
  height?: number; stickW?: number; gap?: number;
}) {
  const { ref, width } = useMeasure();
  const { ref: canvasRef } = useCanvas2d(width, height);

  const [t, setT] = React.useState(0);
  const [hover, setHover] = React.useState<number | null>(null);
  const [tip, setTip] = React.useState<{
    x: number; y: number;
    title: string;
    day: string;
    final: number;
    comps: Components;
  } | null>(null);
  const hitsRef = React.useRef<Hit[]>([]);

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

    // Layout paddings & gutters (match other cards)
    const pad = { l: 66, r: 48, t: 10, b: 22 };
    const innerGutter = 16;  // padding between Y labels and plot
    const labelGap = 16;     // Y label text offset
    const iw = Math.max(10, W - pad.l - pad.r);
    const ih = Math.max(10, H - pad.t - pad.b);
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

    // Downsample only if necessary (always keep latest)
    const MIN_STICK = 4;
    const MIN_GAP = 4;
    const capacity = Math.max(1, Math.floor((plotW + MIN_GAP) / (MIN_STICK + MIN_GAP)));

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

    // Fit bars
    const n = toDraw.length;
    const baseTotal = n * stickW + Math.max(0, n - 1) * gap;
    let scale = baseTotal > plotW ? plotW / baseTotal : 1;

    let sW = Math.max(MIN_STICK, Math.floor(stickW * scale));
    let g = Math.max(MIN_GAP, Math.floor(gap * scale));
    let total = n * sW + Math.max(0, n - 1) * g;

    if (total > plotW) {
      g = MIN_GAP;
      const targetForBars = plotW - Math.max(0, n - 1) * g;
      sW = Math.max(MIN_STICK, Math.floor(targetForBars / n));
      total = n * sW + Math.max(0, n - 1) * g;
      while (total > plotW && sW > MIN_STICK) {
        sW -= 1;
        total = n * sW + Math.max(0, n - 1) * g;
      }
    }

    const x0 = plotL + Math.max(0, Math.floor((plotW - total) / 2));

    // Latest dot colors (lighter green)
    const DOT_FILL = '#86efac';   // green-300
    const DOT_STROKE = '#22c55e'; // green-500

    // DRAW
    hitsRef.current = [];
    ctx.save();
    ctx.beginPath();
    ctx.rect(plotL + 0.5, pad.t + 0.5, plotW - 1, ih - 1);
    ctx.clip();

    for (let i = 0; i < n; i++) {
      const r = toDraw[i];
      const x = x0 + i * (sW + g);

      const h = ih * clamp01((r.final / 100) * t);
      const yTop = baseline - h;

      // hover band
      if (hover === i) {
        ctx.save();
        ctx.fillStyle = 'rgba(16,24,40,0.06)';
        const bandPad = 6;
        ctx.fillRect(x - bandPad, pad.t + 2, sW + bandPad * 2, ih - 2);
        ctx.restore();
      }

      // single-color bar (no stacked segments)
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.08)';
      ctx.shadowBlur = 8;
      ctx.shadowOffsetY = 2;
      ctx.fillStyle = PR_COLORS.noteFill;
      ctx.fillRect(Math.round(x), Math.round(yTop), sW, Math.max(0, Math.round(h)));
      ctx.restore();

      // crisp outer stroke
      ctx.strokeStyle = PR_COLORS.noteStroke; ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, yTop + 0.5, sW - 1, Math.max(0, Math.round(h) - 1));

      hitsRef.current.push({ x1: x, x2: x + sW, cx: x + sW / 2, top: yTop, h, row: r });
    }

    // Latest dot + inline value
    if (n >= 1) {
      const i = n - 1;
      const cx = x0 + i * (sW + g) + sW / 2;
      const y = baseline - ih * clamp01((toDraw[i].final / 100) * t);

      ctx.fillStyle = DOT_FILL; ctx.beginPath(); ctx.arc(cx, y, 6, 0, Math.PI * 2); ctx.fill();
      ctx.lineWidth = 1.5; ctx.strokeStyle = DOT_STROKE; ctx.stroke();

      ctx.fillStyle = '#0f0f0f'; ctx.font = '12px ui-sans-serif, system-ui';
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillText(`${Math.round(toDraw[i].final)}%`, cx + 10, y);
    }

    // Focus ring
    if (hover != null && hitsRef.current[hover]) {
      const h = hitsRef.current[hover];
      const left = h.x1 - 6, right = h.x2 + 6;
      ctx.save();
      ctx.strokeStyle = 'rgba(16,24,40,0.25)';
      ctx.lineWidth = 2;
      ctx.strokeRect(left + 0.5, pad.t + 1.5, Math.max(0, right - left), ih - 3);
      ctx.restore();
    }

    ctx.restore(); // end plot clip

    // ❌ No X labels (intentionally omitted to avoid overlap)
  }, [canvasRef, width, height, rows, stickW, gap, t, hover]);

  // hover + tooltip
  const onMouseMove = React.useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    const rect = el.getBoundingClientRect();
    const x = e.clientX - rect.left;
    let idx: number | null = null;
    for (let i = 0; i < hitsRef.current.length; i++) {
      const h = hitsRef.current[i];
      if (x >= h.x1 - 8 && x <= h.x2 + 8) { idx = i; break; }
    }
    setHover(idx);
    if (idx != null) {
      const h = hitsRef.current[idx];
      const tipX = clamp(h.cx, 8, rect.width - 8);
      const tipY = h.top - 14;
      setTip({
        x: tipX,
        y: Math.max(12, tipY),
        title: h.row.lessonTitle,
        day: h.row.day,
        final: Math.round(h.row.final),
        comps: h.row.comps,
      });
    } else {
      setTip(null);
    }
  }, []);
  const onMouseLeave = React.useCallback(() => { setHover(null); setTip(null); }, []);

  return (
    <div
      ref={ref}
      className="relative w-full"
      style={{ height }}
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
              <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: '#22c55e' }} />
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
  const supabase = React.useMemo(() => createClient(), []);
  const [loading, setLoading] = React.useState(true);
  const [err, setErr] = React.useState<string | null>(null);
  const [rows, setRows] = React.useState<Row[]>([]);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true); setErr(null);
        await ensureSessionReady(supabase, 2000);
        const { data: u } = await supabase.auth.getUser();
        const uid = u.user?.id; if (!uid) throw new Error('No user');

        // Pull individual results with component details (no daily averaging)
        const { data, error } = await supabase
          .from('lesson_results')
          .select('created_at, lesson_slug, final_percent, pitch_percent, rhythm_melody_percent, rhythm_line_percent, intervals_correct_ratio')
          .eq('uid', uid)
          .order('created_at', { ascending: true })
          .limit(400);
        if (error) throw error;

        const out: Row[] = (data ?? []).map((r: any) => {
          const ts = new Date(r.created_at).toISOString();
          const slug = String(r.lesson_slug || '');
          const comps: Components = {
            pitch: Number.isFinite(r.pitch_percent) ? Number(r.pitch_percent) : undefined,
            melody: Number.isFinite(r.rhythm_melody_percent) ? Number(r.rhythm_melody_percent) : undefined,
            line: Number.isFinite(r.rhythm_line_percent) ? Number(r.rhythm_line_percent) : undefined,
            intervals: Number.isFinite(r.intervals_correct_ratio) ? Math.round(Number(r.intervals_correct_ratio) * 10000) / 100 : undefined,
          };
          return {
            ts,
            day: fmtDay(ts),
            final: clamp(Number(r.final_percent ?? 0), 0, 100),
            lessonSlug: slug,
            // avoid mixing ?? and || without parentheses
            lessonTitle: (titleByLessonSlug[slug] ?? (slug || 'Unknown Lesson')),
            comps,
          };
        });

        if (!cancelled) setRows(out);
      } catch (e: any) {
        if (!cancelled) setErr(e?.message || String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [supabase]);

  return (
    <div className="rounded-2xl border border-[#d2d2d2] bg-gradient-to-b from-white to-[#f7f7f7] p-6 shadow-sm">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-2xl font-semibold text-[#0f0f0f]">Session Performance</h3>
      </div>
      {loading ? (
        <div className="h-[78%] mt-2 animate-pulse rounded-xl bg-[#e8e8e8]" />
      ) : rows.length === 0 ? (
        <div className="h-[78%] mt-2 flex items-center justify-center text-base text-[#0f0f0f]">
          No sessions yet — run an exercise to unlock your dashboard.
        </div>
      ) : (
        <VerticalTimeBars rows={rows} height={360} stickW={12} gap={12} />
      )}
      {err ? <div className="mt-3 text-sm text-[#dc2626]">{err}</div> : null}
    </div>
  );
}
