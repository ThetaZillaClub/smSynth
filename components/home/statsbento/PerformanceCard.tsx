// components/home/statsbento/PerformanceCard.tsx
'use client';

import * as React from 'react';
import { createClient } from '@/lib/supabase/client';
import { ensureSessionReady } from '@/lib/client-cache';
import { PR_COLORS } from '@/utils/stage';

/* ─────────── small utils ─────────── */
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const clamp = (x: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, x));
const fmtDay = (iso: string) => { const d = new Date(iso); return `${d.getMonth() + 1}/${d.getDate()}`; };
const rolling = (xs: number[], k = 5) => xs.map((_, i) => {
  const s = Math.max(0, i - (k - 1)); const seg = xs.slice(s, i + 1);
  return seg.reduce((a, b) => a + b, 0) / seg.length;
});

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

/* ─────────── vertical thin bars canvas ─────────── */
function VerticalTimeBars({
  rows,
  height = 360,
  stickW = 12,
  gap = 12,
}: {
  rows: { day: string; final: number; avg: number }[];
  height?: number; stickW?: number; gap?: number;
}) {
  const { ref, width } = useMeasure();
  const { ref: canvasRef } = useCanvas2d(width, height);
  const [t, setT] = React.useState(0);

  React.useEffect(() => {
    let raf = 0; const start = performance.now();
    const tick = (now: number) => { const u = (now - start) / 800; setT(u >= 1 ? 1 : u); if (u < 1) raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick); return () => cancelAnimationFrame(raf);
  }, []);

  React.useEffect(() => {
    const c = canvasRef.current; if (!c) return;
    const ctx = c.getContext('2d'); if (!ctx) return;
    const W = width, H = height;
    ctx.clearRect(0, 0, W, H);

    // Match the newer chart structure (gutters + label gaps + clipping)
    const pad = { l: 66, r: 48, t: 10, b: 22 };
    const innerGutter = 16;  // between Y labels and plot
    const labelGap = 16;     // text offset from plot edge
    const iw = Math.max(10, W - pad.l - pad.r);
    const ih = Math.max(10, H - pad.t - pad.b);
    const baseline = pad.t + ih;

    const plotL = pad.l + innerGutter;
    const plotR = pad.l + iw - innerGutter;
    const plotW = Math.max(10, plotR - plotL);

    // Grid + Y axis (0–100%)
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

    // Fit bars to available width
    const n = rows.length;
    const MIN_STICK = 4;
    const MIN_GAP = 4;

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

    // Colors for trend + dot (Milestones blue)
    const BLUE = '#3b82f6';
    const BLUE_DARK = '#1d4ed8';

    // Clip to plot for all drawing inside the chart
    ctx.save();
    ctx.beginPath();
    ctx.rect(plotL + 0.5, pad.t + 0.5, plotW - 1, ih - 1);
    ctx.clip();

    // Rolling average line
    if (n > 1) {
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = BLUE;
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        const cx = x0 + i * (sW + g) + sW / 2;
        const y = baseline - ih * clamp01((rows[i].avg / 100) * t);
        if (i === 0) ctx.moveTo(cx, y); else ctx.lineTo(cx, y);
      }
      ctx.stroke();
    }

    // Bars
    const labelStep = Math.max(1, Math.ceil(n / 10));
    for (let i = 0; i < n; i++) {
      const x = x0 + i * (sW + g);
      const h = ih * clamp01((rows[i].final / 100) * t);
      const y = baseline - h;

      // subtle depth
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.08)';
      ctx.shadowBlur = 8;
      ctx.shadowOffsetY = 2;

      ctx.fillStyle = PR_COLORS.noteFill;
      ctx.fillRect(Math.round(x), Math.round(y), sW, Math.max(0, Math.round(h)));

      ctx.restore();

      // crisp stroke
      ctx.strokeStyle = PR_COLORS.noteStroke; ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, y + 0.5, sW - 1, Math.max(0, Math.round(h) - 1));
    }

    // Latest dot + value label (in-plot)
    if (n >= 1) {
      const i = n - 1;
      const cx = x0 + i * (sW + g) + sW / 2;
      const y = baseline - ih * clamp01((rows[i].final / 100) * t);

      ctx.fillStyle = BLUE; ctx.beginPath(); ctx.arc(cx, y, 6, 0, Math.PI * 2); ctx.fill();
      ctx.lineWidth = 1.5; ctx.strokeStyle = BLUE_DARK; ctx.stroke();

      ctx.fillStyle = '#0f0f0f'; ctx.font = '12px ui-sans-serif, system-ui';
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillText(`${Math.round(rows[i].final)}%`, cx + 10, y);
    }

    ctx.restore(); // end plot clip

    // X labels (clamped to plot)
    ctx.save();
    ctx.beginPath();
    ctx.rect(plotL, pad.t, plotW, ih + 28);
    ctx.clip();
    ctx.fillStyle = '#0f0f0f'; ctx.font = '14px ui-sans-serif, system-ui';
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';

    for (let i = 0; i < n; i++) {
      if (i % labelStep !== 0) continue;
      const centerIdeal = x0 + i * (sW + g) + sW / 2;
      const center = clamp(centerIdeal, plotL + 8, plotR - 8);
      ctx.fillText(rows[i].day, center, baseline + 8);
    }
    ctx.restore();
  }, [canvasRef, width, height, rows, stickW, gap, t]);

  return <div ref={ref} className="relative w-full" style={{ height }}>
    <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block', borderRadius: 12 }} />
  </div>;
}

/* ─────────── card ─────────── */
export default function PerformanceCard() {
  const supabase = React.useMemo(() => createClient(), []);
  const [loading, setLoading] = React.useState(true);
  const [err, setErr] = React.useState<string | null>(null);
  const [rows, setRows] = React.useState<{ day: string; final: number; avg: number }[]>([]);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true); setErr(null);
        await ensureSessionReady(supabase, 2000);
        const { data: u } = await supabase.auth.getUser();
        const uid = u.user?.id; if (!uid) throw new Error('No user');

        const { data, error } = await supabase
          .from('lesson_results')
          .select('created_at, final_percent')
          .eq('uid', uid)
          .order('created_at', { ascending: true })
          .limit(60);
        if (error) throw error;

        const byDay = new Map<string, { finals: number[] }>();
        for (const r of (data ?? []) as any[]) {
          const day = new Date(r.created_at).toISOString().slice(0, 10);
          const cell = byDay.get(day) ?? { finals: [] };
          cell.finals.push(Number(r.final_percent || 0));
          byDay.set(day, cell);
        }
        const trend = Array.from(byDay.entries())
          .sort(([a],[b]) => (a < b ? -1 : 1))
          .map(([d, v]) => ({ day: fmtDay(d), final: v.finals.reduce((a,b)=>a+b,0)/Math.max(1,v.finals.length) }));
        const avg = rolling(trend.map(t => t.final), 5);
        const out = trend.map((r,i) => ({ day: r.day, final: +r.final.toFixed(1), avg: +avg[i].toFixed(1) }));
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
        {/* removed the subheader per request */}
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
