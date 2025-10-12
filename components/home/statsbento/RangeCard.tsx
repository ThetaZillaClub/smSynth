// components/home/statsbento/RangeCard.tsx
'use client';

import * as React from 'react';
import { createClient } from '@/lib/supabase/client';
import { ensureSessionReady, getCurrentStudentRowCached, getCurrentRangeCached } from '@/lib/client-cache';

export default function RangeCard() {
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

  return (
    <div className="h-full rounded-2xl border border-[#d2d2d2] bg-[#fcfcfc] p-6 shadow-sm">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-xl font-semibold text-[#0f0f0f]">Range</h3>
        {/* subtitle removed */}
      </div>
      {loading ? (
        <div className="h-[64%] mt-3 animate-pulse rounded-xl bg-[#efefef]" />
      ) : (
        <div className="h-[64%] mt-2 flex items-center">
          <div className="text-3xl font-semibold tracking-tight">{label}</div>
        </div>
      )}
      {err ? <div className="mt-2 text-xs text-[#dc2626]">{err}</div> : null}
    </div>
  );
}
