// components/home/statsbento/PerformanceCard.tsx
'use client';

import * as React from 'react';
import { createClient } from '@/lib/supabase/client';
import { ensureSessionReady } from '@/lib/client-cache';
import { PR_COLORS } from '@/utils/stage';

/* ─────────── small utils ─────────── */
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

    const pad = { l: 48, r: 16, t: 12, b: 48 };
    const iw = Math.max(10, W - pad.l - pad.r);
    const ih = Math.max(10, H - pad.t - pad.b);
    const baseline = pad.t + ih;

    // grid + Y labels (0–100%)
    const ticks = 4;
    ctx.font = '13px ui-sans-serif, system-ui';
    ctx.fillStyle = '#0f0f0f';
    for (let i = 0; i <= ticks; i++) {
      const y = Math.round(pad.t + (ih * i) / ticks) + 0.5;
      const major = i % 2 === 0;
      ctx.strokeStyle = major ? PR_COLORS.gridMajor : PR_COLORS.gridMinor;
      ctx.lineWidth = major ? 1.25 : 0.75;
      ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(pad.l + iw, y); ctx.stroke();

      const val = Math.round((100 * (ticks - i)) / ticks);
      ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      ctx.fillText(`${val}%`, pad.l - 8, y);
    }

    const n = rows.length;
    const totalW = n * stickW + Math.max(0, n - 1) * gap;
    const x0 = pad.l + Math.max(0, (iw - totalW) / 2);

    // rolling avg under bars
    if (n > 1) {
      ctx.lineWidth = 2.5; ctx.strokeStyle = PR_COLORS.dotFill;
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        const cx = x0 + i * (stickW + gap) + stickW / 2;
        const y = baseline - ih * clamp((rows[i].avg / 100) * t);
        if (i === 0) ctx.moveTo(cx, y); else ctx.lineTo(cx, y);
      }
      ctx.stroke();
    }

    const labelStep = Math.max(1, Math.ceil(n / 10));
    ctx.fillStyle = '#0f0f0f'; ctx.font = '13px ui-sans-serif, system-ui';
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';

    for (let i = 0; i < n; i++) {
      const x = x0 + i * (stickW + gap);
      const h = ih * clamp((rows[i].final / 100) * t);
      const y = baseline - h;

      ctx.fillStyle = PR_COLORS.noteFill;
      ctx.fillRect(x, y, stickW, h);
      ctx.strokeStyle = PR_COLORS.noteStroke; ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, y + 0.5, stickW, h);

      if (i % labelStep === 0) ctx.fillText(rows[i].day, x + stickW / 2, baseline + 10);
    }

    // latest dot + value label
    if (n >= 1) {
      const i = n - 1;
      const cx = x0 + i * (stickW + gap) + stickW / 2;
      const y = baseline - ih * clamp((rows[i].final / 100) * t);
      ctx.fillStyle = PR_COLORS.dotFill; ctx.beginPath(); ctx.arc(cx, y, 6, 0, Math.PI * 2); ctx.fill();
      ctx.lineWidth = 1.25; ctx.strokeStyle = PR_COLORS.dotStroke; ctx.stroke();

      ctx.fillStyle = '#0f0f0f'; ctx.font = '12px ui-sans-serif, system-ui';
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillText(`${Math.round(rows[i].final)}%`, cx + 10, y);
    }
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
        <div className="text-sm text-[#0f0f0f]">Final score by day · 5-day avg</div>
      </div>
      {loading ? (
        <div className="h-[75%] mt-4 animate-pulse rounded-xl bg-[#e8e8e8]" />
      ) : rows.length === 0 ? (
        <div className="h-[75%] mt-4 flex items-center justify-center text-base text-[#0f0f0f]">
          No sessions yet — run an exercise to unlock your dashboard.
        </div>
      ) : (
        <VerticalTimeBars rows={rows} height={360} stickW={12} gap={12} />
      )}
      {err ? <div className="mt-3 text-sm text-[#dc2626]">{err}</div> : null}
    </div>
  );
}
