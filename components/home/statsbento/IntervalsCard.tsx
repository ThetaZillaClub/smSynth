// components/home/statsbento/IntervalsCard.tsx
'use client';

import * as React from 'react';
import { createClient } from '@/lib/supabase/client';
import { ensureSessionReady } from '@/lib/client-cache';
import { PR_COLORS } from '@/utils/stage';

const ease = (t: number) => 1 - Math.pow(1 - Math.max(0, Math.min(1, t)), 3);
const clamp = (x: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, x));
const intervalName = (s: number) =>
  ({0:'Unison',1:'m2',2:'M2',3:'m3',4:'M3',5:'P4',6:'TT',7:'P5',8:'m6',9:'M6',10:'m7',11:'M7',12:'Octave'} as Record<number,string>)[s] ?? `${s}`;

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

function VerticalSticks({
  items, height = 320, stickW = 12, gap = 16, max = 100,
}: { items: { label: string; v1: number }[]; height?: number; stickW?: number; gap?: number; max?: number; }) {
  const { ref, width } = useMeasure();
  const { ref: canvasRef } = useCanvas2d(width, height);
  const [t, setT] = React.useState(0);
  React.useEffect(() => {
    let raf = 0; const start = performance.now();
    const tick = (now: number) => { const u = ease((now - start) / 700); setT(u); if (u < 1) raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick); return () => cancelAnimationFrame(raf);
  }, []);
  React.useEffect(() => {
    const c = canvasRef.current; if (!c) return; const ctx = c.getContext('2d'); if (!ctx) return;
    const W = width, H = height;
    ctx.clearRect(0, 0, W, H);

    // tighter bottom padding
    const pad = { l: 48, r: 16, t: 12, b: 28 };
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

      const val = Math.round((max * (ticks - i)) / ticks);
      ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      ctx.fillText(`${val}%`, pad.l - 8, y);
    }

    const totalW = items.length * stickW + Math.max(0, items.length - 1) * gap;
    const x0 = pad.l + Math.max(0, (iw - totalW) / 2);

    const labelStep = Math.max(1, Math.ceil(items.length / 8));
    ctx.fillStyle = '#0f0f0f'; ctx.font = '13px ui-sans-serif, system-ui';
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';

    items.forEach((it, i) => {
      const x = x0 + i * (stickW + gap);
      const h = ih * clamp((it.v1 / max) * t);
      const y = baseline - h;

      ctx.fillStyle = PR_COLORS.noteFill;
      ctx.fillRect(x, y, stickW, h);
      ctx.strokeStyle = PR_COLORS.noteStroke; ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, y + 0.5, stickW, h);

      if (i % labelStep === 0) ctx.fillText(it.label, x + stickW / 2, baseline + 6);
    });
  }, [canvasRef, width, height, items, stickW, gap, max, t]);

  return <div ref={ref} className="relative w-full" style={{ height }}>
    <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block', borderRadius: 12 }} />
  </div>;
}

export default function IntervalsCard() {
  const supabase = React.useMemo(() => createClient(), []);
  const [loading, setLoading] = React.useState(true);
  const [err, setErr] = React.useState<string | null>(null);
  const [items, setItems] = React.useState<{ label: string; v1: number }[]>([]);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true); setErr(null);
        await ensureSessionReady(supabase, 2000);
        const { data: u } = await supabase.auth.getUser();
        const uid = u.user?.id; if (!uid) throw new Error('No user');

        const { data: results, error: rErr } = await supabase
          .from('lesson_results')
          .select('id, created_at')
          .eq('uid', uid)
          .order('created_at', { ascending: true })
          .limit(60);
        if (rErr) throw rErr;
        const recentIds = (results ?? []).slice(-30).map((r: any) => r.id);
        if (!recentIds.length) { if (!cancelled) setItems([]); return; }

        const iQ = await supabase
          .from('lesson_result_interval_classes')
          .select('result_id, semitones, attempts, correct')
          .in('result_id', recentIds);
        if (iQ.error) throw iQ.error;

        const by = new Map<number, { a: number; c: number }>(); for (let i = 0; i <= 12; i++) by.set(i,{a:0,c:0});
        for (const r of (iQ.data ?? []) as any[]) {
          const g = by.get(r.semitones)!; g.a += Number(r.attempts || 0); g.c += Number(r.correct || 0);
        }

        // Strict semitone order: Unison (0) -> Octave (12); keep anchors even if 0%
        const anchors = new Set([0,2,3,7,12]);
        const list = Array.from({ length: 13 }, (_, s) => {
          const v = by.get(s)!;
          const pct = v.a ? Math.round((100 * v.c) / v.a) : 0;
          return { s, label: intervalName(s), v1: pct };
        })
          .filter(x => x.v1 > 0 || anchors.has(x.s))
          .map(({ label, v1 }) => ({ label, v1 }));

        if (!cancelled) setItems(list);
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
        <h3 className="text-2xl font-semibold text-[#0f0f0f]">Intervals</h3>
        <div className="text-sm text-[#0f0f0f]">Correct % by class</div>
      </div>
      {loading ? (
        <div className="h-[75%] mt-3 animate-pulse rounded-xl bg-[#e8e8e8]" />
      ) : items.length === 0 ? (
        <div className="h-[75%] mt-3 flex items-center justify-center text-base text-[#0f0f0f]">No interval attempts yet.</div>
      ) : (
        <VerticalSticks items={items} height={320} stickW={12} gap={16} max={100} />
      )}
      {err ? <div className="mt-3 text-sm text-[#dc2626]">{err}</div> : null}
    </div>
  );
}
