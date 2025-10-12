// components/home/statsbento/RatingCard.tsx
'use client';

import * as React from 'react';
import { createClient } from '@/lib/supabase/client';
import { ensureSessionReady } from '@/lib/client-cache';
import { PR_COLORS } from '@/utils/stage';

const clamp = (x: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, x));
const ease = (t: number) => 1 - Math.pow(1 - Math.max(0, Math.min(1, t)), 3);

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

function RadialGauge({ value, label, delta, pool, height = 340 }: { value: number; label: string; delta?: number; pool?: string; height?: number }) {
  const { ref, width } = useMeasure();
  const { ref: canvasRef } = useCanvas2d(width, height);
  const [t, setT] = React.useState(0);
  React.useEffect(() => {
    let raf = 0; const start = performance.now();
    const tick = (now: number) => { const u = ease((now - start) / 800); setT(u); if (u < 1) raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick); return () => cancelAnimationFrame(raf);
  }, []);
  React.useEffect(() => {
    const c = canvasRef.current; if (!c) return; const ctx = c.getContext('2d'); if (!ctx) return;
    const W = width, H = height;
    ctx.clearRect(0, 0, W, H); // transparent canvas

    const cx = W / 2, cy = H / 2 + 8;
    const r = Math.min(W, H) * 0.34;
    const thick = 18;
    const start = 220 * (Math.PI / 180);
    const end = -40 * (Math.PI / 180);
    const span = end - start;

    // rail
    ctx.strokeStyle = PR_COLORS.gridMinor; ctx.lineWidth = thick; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(cx, cy, r, start, end); ctx.stroke();

    // value
    const ang = start + span * clamp(value) * t;
    ctx.strokeStyle = PR_COLORS.noteFill;
    ctx.beginPath(); ctx.arc(cx, cy, r, start, ang); ctx.stroke();

    // label
    ctx.fillStyle = '#0f0f0f'; ctx.textAlign = 'center';
    ctx.font = '700 44px ui-sans-serif, system-ui';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(label, cx, cy - 4);

    // pool + delta
    ctx.font = '14px ui-sans-serif, system-ui';
    ctx.textBaseline = 'hanging';
    const meta = pool ? `${pool}` : '—';
    ctx.fillText(meta, cx, cy + 8);
    if (delta != null) {
      const txt = delta === 0 ? '±0.0' : delta > 0 ? `▲ +${delta.toFixed(1)}` : `▼ ${delta.toFixed(1)}`;
      ctx.fillText(txt, cx, cy + 28);
    }
  }, [canvasRef, width, height, value, label, delta, pool, t]);

  return <div ref={ref} className="relative w-full" style={{ height }}>
    <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block', borderRadius: 12 }} />
  </div>;
}

export default function RatingCard() {
  const supabase = React.useMemo(() => createClient(), []);
  const [loading, setLoading] = React.useState(true);
  const [err, setErr] = React.useState<string | null>(null);
  const [rating, setRating] = React.useState<{ value: number; delta: number; pool: string } | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true); setErr(null);
        await ensureSessionReady(supabase, 2000);
        const { data: u } = await supabase.auth.getUser();
        const uid = u.user?.id; if (!uid) throw new Error('No user');

        const [ratings, events] = await Promise.all([
          supabase.from('player_ratings').select('pool, rating, rd, vol, last_period').eq('uid', uid).order('rating', { ascending: false }),
          supabase.from('rating_events').select('pool, period_end, rating_after, rating_before, uid').eq('uid', uid).order('period_end', { ascending: false }).limit(30),
        ]);
        if (ratings.error) throw ratings.error;
        if (events.error) throw events.error;

        const best = (ratings.data as any[] | null)?.[0] ?? null;
        let delta = 0;
        if (best) {
          const ev = (events.data as any[] | null)?.find(e => e.pool === best.pool);
          if (ev) delta = Math.round((ev.rating_after - ev.rating_before) * 10) / 10;
        }
        if (!cancelled) setRating(best ? { value: Math.round(best.rating), delta, pool: best.pool } : null);
      } catch (e: any) {
        if (!cancelled) setErr(e?.message || String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [supabase]);

  return (
    <div
      className={[
        'relative rounded-2xl border p-6 shadow-sm',
        'bg-gradient-to-b from-white to-[#f7f7f7] border-[#d2d2d2]',
      ].join(' ')}
    >
      <div className="absolute left-0 top-0 bottom-0 w-1.5 rounded-l-2xl" style={{ background: PR_COLORS.noteFill }} />
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-2xl font-semibold text-[#0f0f0f]">Rating</h3>
        <div className="text-sm text-[#0f0f0f]">{rating?.pool ?? '—'}</div>
      </div>
      {loading ? (
        <div className="h-[75%] mt-4 animate-pulse rounded-xl bg-[#e8e8e8]" />
      ) : !rating ? (
        <div className="h-[75%] mt-4 flex items-center justify-center text-base text-[#0f0f0f]">
          Play a lesson to get rated.
        </div>
      ) : (
        <RadialGauge
          value={clamp((rating.value - 800) / (2300 - 800))}
          label={`${rating.value}`}
          delta={rating.delta}
          pool={rating.pool}
          height={340}
        />
      )}
      {err ? <div className="mt-3 text-sm text-[#dc2626]">{err}</div> : null}
    </div>
  );
}
