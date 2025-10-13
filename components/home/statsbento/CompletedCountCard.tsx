// components/home/statsbento/CompletedCountCard.tsx
'use client';

import * as React from 'react';
import { letterFromPercent } from '@/utils/scoring/grade';
import { useHomeResults } from '@/components/home/data/HomeResultsProvider';

const PASSED = new Set(['A', 'A-', 'B+', 'B', 'B-']);

export default function CompletedCountCard({ compact = false }: { compact?: boolean }) {
  const { rows, loading, error: err } = useHomeResults();

  const count = React.useMemo(() => {
    const bestBy: Record<string, number> = {};
    for (const r of rows) {
      const slug = String(r.lesson_slug ?? '');
      const pct = Number(r.final_percent ?? 0);
      if (!slug) continue;
      bestBy[slug] = Math.max(bestBy[slug] ?? 0, pct);
    }
    return Object.values(bestBy).filter((v) => PASSED.has(letterFromPercent(v))).length;
  }, [rows]);

  const pad = compact ? 'p-4' : 'p-6';
  const titleCls = compact ? 'text-sm font-semibold' : 'text-xl font-semibold';
  const valueCls = compact ? 'text-2xl font-semibold tracking-tight' : 'text-3xl font-semibold tracking-tight';
  const bodyH = compact ? 'h-[48%]' : 'h-[64%]';

  return (
    <div className={`h-full rounded-2xl border border-[#d2d2d2] bg-[#fcfcfc] ${pad} shadow-sm`}>
      <div className="flex items-baseline justify-between gap-3">
        <h3 className={`${titleCls} text-[#0f0f0f]`}>Completed</h3>
      </div>
      {loading ? (
        <div className={`${bodyH} mt-2 animate-pulse rounded-xl bg-[#efefef]`} />
      ) : (
        <div className={`${bodyH} mt-1 flex items-center`}>
          <div className={`${valueCls}`}>{count}</div>
        </div>
      )}
      {err ? <div className={`${compact ? 'mt-1 text-[11px]' : 'mt-2 text-xs'} text-[#dc2626]`}>{err}</div> : null}
    </div>
  );
}
