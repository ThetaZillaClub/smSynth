'use client';

import * as React from 'react';
import { createClient } from '@/lib/supabase/client';
import { ensureSessionReady } from '@/lib/client-cache';
import useStudentRow from '@/hooks/students/useStudentRow';
import useStudentRange from '@/hooks/students/useStudentRange';

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

  // Range from existing hooks (nice touch for "bento")
  const { studentRowId, rangeLowLabel, rangeHighLabel } = useStudentRow({ studentIdFromQuery: null });
  const { lowHz, highHz } = useStudentRange(studentRowId, {
    rangeLowLabel,
    rangeHighLabel,
  });

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await ensureSessionReady(supabase, 2000);
        const { count, error } = await supabase
          .from('models')
          .select('id', { count: 'exact', head: true });
        if (error) throw error;
        if (!cancelled) setModelsCount(count ?? 0);
      } catch {
        if (!cancelled) setModelsCount(0);
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
    {
      label: 'Range',
      value:
        lowHz && highHz
          ? `${Math.round(lowHz)}–${Math.round(highHz)} Hz`
          : (rangeLowLabel && rangeHighLabel) ? `${rangeLowLabel}–${rangeHighLabel}` : '—',
    },
    { label: 'Students', value: (modelsCount ?? '—').toString() },
  ];

  return (
    <div
      className={[
        'grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4',
      ].join(' ')}
    >
      {items.map((it) => (
        <div
          key={it.label}
          className={[
            'rounded-xl bg-[#f9f9f9] border border-[#dcdcdc] shadow-sm',
            'p-4 md:p-5',
          ].join(' ')}
        >
          <div className="text-xs uppercase tracking-wide text-[#575757]">{it.label}</div>
          <div className="mt-1 text-xl md:text-2xl font-semibold">{it.value}</div>
        </div>
      ))}
    </div>
  );
}
