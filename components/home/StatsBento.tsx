// components/home/StatsBento.tsx
'use client';

import * as React from 'react';
import { createClient } from '@/lib/supabase/client';
import { ensureSessionReady, getCurrentStudentRowCached, getCurrentRangeCached } from '@/lib/client-cache';

function readLocalNumber(keys: string[], fallback = 0) {
  try {
    for (const k of keys) {
      const raw = localStorage.getItem(k);
      const n = raw ? Number(raw) : NaN;
      if (!Number.isNaN(n)) return n;
    }
  } catch {}
  return fallback;
}

export default function StatsBento() {
  const supabase = React.useMemo(() => createClient(), []);
  const [modelsCount, setModelsCount] = React.useState<number | null>(null);
  const [rangeLabel, setRangeLabel] = React.useState<string>('—');

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await ensureSessionReady(supabase, 2000);

        // Use cached current row once (no extra network if someone else fetched it)
        const row = await getCurrentStudentRowCached(supabase);
        const rangeRow = await getCurrentRangeCached(supabase); // also cached if multiple readers

        const low = rangeRow?.range_low ?? row?.range_low ?? null;
        const high = rangeRow?.range_high ?? row?.range_high ?? null;
        if (!cancelled) {
          setRangeLabel(low && high ? `${low}–${high}` : '—');
        }

        const { count, error } = await supabase
          .from('models')
          .select('id', { count: 'exact', head: true });
        if (error) throw error;
        if (!cancelled) setModelsCount(count ?? 0);
      } catch {
        if (!cancelled) {
          setModelsCount(0);
          setRangeLabel('—');
        }
      }
    })();
    return () => { cancelled = true; };
  }, [supabase]);

  // Simple local stats (safe fallbacks)
  const streak = readLocalNumber(['practice:streak', 'streak:days'], 0);
  const sessions = readLocalNumber(['sessions:count', 'practice:sessions'], 0);

  const items = [
    { label: 'Streak', value: `${streak} day${streak === 1 ? '' : 's'}` },
    { label: 'Sessions', value: sessions.toString() },
    { label: 'Range', value: rangeLabel },
    { label: 'Students', value: (modelsCount ?? '—').toString() },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
      {items.map((it) => (
        <div
          key={it.label}
          className="rounded-xl bg-[#f9f9f9] border border-[#dcdcdc] shadow-sm p-4 md:p-5"
        >
          <div className="text-xs uppercase tracking-wide text-[#575757]">{it.label}</div>
          <div className="mt-1 text-xl md:text-2xl font-semibold">{it.value}</div>
        </div>
      ))}
    </div>
  );
}
