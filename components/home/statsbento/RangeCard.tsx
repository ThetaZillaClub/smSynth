// components/home/statsbento/RangeCard.tsx
'use client';

import * as React from 'react';
import { createClient } from '@/lib/supabase/client';
import { ensureSessionReady, getCurrentStudentRowCached } from '@/lib/client-cache';

export default function RangeCard({ compact = false }: { compact?: boolean }) {
  const supabase = React.useMemo(() => createClient(), []);
  const [loading, setLoading] = React.useState(true);
  const [err, setErr] = React.useState<string | null>(null);

  // Track both labels so we can respond to one-sided updates (low OR high)
  const [studentRowId, setStudentRowId] = React.useState<string | null>(null);
  const [lowLabel, setLowLabel] = React.useState<string | null>(null);
  const [highLabel, setHighLabel] = React.useState<string | null>(null);

  // Initial load from the single shared cached student row
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setErr(null);
        await ensureSessionReady(supabase, 2000);

        const row = await getCurrentStudentRowCached(supabase);
        if (cancelled) return;

        setStudentRowId(row?.id ?? null);
        setLowLabel(row?.range_low ?? null);
        setHighLabel(row?.range_high ?? null);
      } catch (e: any) {
        if (!cancelled) setErr(e?.message || String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  // Live update when range changes elsewhere in the app (e.g., setup page)
  React.useEffect(() => {
    const onRangeUpdated = (evt: Event) => {
      const e = evt as CustomEvent<{ which: 'low' | 'high'; label: string; studentRowId: string | null }>;
      // If the event targets a specific row and it's not ours, ignore.
      if (e.detail?.studentRowId && studentRowId && e.detail.studentRowId !== studentRowId) return;
      if (e.detail?.which === 'low') setLowLabel(e.detail.label ?? null);
      if (e.detail?.which === 'high') setHighLabel(e.detail.label ?? null);
    };
    window.addEventListener('student-range-updated', onRangeUpdated as EventListener);
    return () => window.removeEventListener('student-range-updated', onRangeUpdated as EventListener);
  }, [studentRowId]);

  const label = lowLabel && highLabel ? `${lowLabel}–${highLabel}` : '—';

  const pad = compact ? 'p-4' : 'p-6';
  const titleCls = compact ? 'text-sm font-semibold' : 'text-xl font-semibold';
  const valueCls = compact ? 'text-2xl font-semibold tracking-tight' : 'text-3xl font-semibold tracking-tight';
  const bodyH = compact ? 'h-[48%]' : 'h-[64%]';

  return (
    <div className={`h-full rounded-2xl border border-[#d2d2d2] bg-gradient-to-b from-[#f2f2f2] to-[#eeeeee] ${pad} shadow-sm`}>
      <div className="flex items-baseline justify-between gap-3">
        <h3 className={`${titleCls} text-[#0f0f0f]`}>Range</h3>
      </div>
      {loading ? (
        <div className={`${bodyH} mt-2 animate-pulse rounded-xl ${compact ? 'bg-[#efefef]' : 'bg-[#efefef]'}`} />
      ) : (
        <div className={`${bodyH} mt-1 flex items-center`}>
          <div className={`${valueCls}`}>{label}</div>
        </div>
      )}
      {err ? <div className={`${compact ? 'mt-1 text-[11px]' : 'mt-2 text-xs'} text-[#dc2626]`}>{err}</div> : null}
    </div>
  );
}
