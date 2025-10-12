// components/home/statsbento/RangeCard.tsx
'use client';

import * as React from 'react';
import { createClient } from '@/lib/supabase/client';
import { ensureSessionReady, getCurrentStudentRowCached, getCurrentRangeCached } from '@/lib/client-cache';

export default function RangeCard({ compact = false }: { compact?: boolean }) {
  const supabase = React.useMemo(() => createClient(), []);
  const [loading, setLoading] = React.useState(true);
  const [err, setErr] = React.useState<string | null>(null);
  const [label, setLabel] = React.useState('—');

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true); setErr(null);
        await ensureSessionReady(supabase, 2000);
        const row = await getCurrentStudentRowCached(supabase);
        const r2 = await getCurrentRangeCached(supabase);
        const low = r2?.range_low ?? row?.range_low ?? null;
        const high = r2?.range_high ?? row?.range_high ?? null;
        if (!cancelled) setLabel(low && high ? `${low}–${high}` : '—');
      } catch (e: any) {
        if (!cancelled) setErr(e?.message || String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [supabase]);

  const pad = compact ? 'p-4' : 'p-6';
  const titleCls = compact ? 'text-sm font-semibold' : 'text-xl font-semibold';
  const valueCls = compact ? 'text-2xl font-semibold tracking-tight' : 'text-3xl font-semibold tracking-tight';
  const bodyH = compact ? 'h-[48%]' : 'h-[64%]';

  return (
    <div className={`h-full rounded-2xl border border-[#d2d2d2] bg-[#fcfcfc] ${pad} shadow-sm`}>
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
