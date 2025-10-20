// components/home/statsbento/LessonsCard.tsx
'use client';

import * as React from 'react';
import { letterFromPercent } from '@/utils/scoring/grade';
import { PR_COLORS } from '@/utils/stage';
import { COURSES } from '@/lib/courses/registry';
import { useHomeResults } from '@/components/home/data/HomeResultsProvider';

const PASSED = new Set(['A+', 'A', 'A-', 'B+', 'B', 'B-']);
const MASTERED = new Set(['A', 'A', 'A+']);
const BLUE_COMPLETED = '#3b82f6';

// namespaced title map: "course/lesson" → title
const titleByCourseLesson: Record<string, string> = (() => {
  const m: Record<string, string> = {};
  for (const c of COURSES) for (const l of c.lessons) m[`${c.slug}/${l.slug}`] = l.title;
  return m;
})();

function titleForKey(key: string): string {
  if (titleByCourseLesson[key]) return titleByCourseLesson[key];
  // legacy fallback: show last segment
  const last = key.includes('/') ? key.split('/').pop() || key : key;
  return last;
}

export default function LessonsCard() {
  const { rows: baseRows, loading, error: baseErr } = useHomeResults();

  const recent = React.useMemo(() => {
    const rows = baseRows ?? [];
    const seen = new Set<string>();
    const out: Array<{ key: string; title: string; pct: number; letter: string; when: string }> = [];

    // walk newest → oldest; provider rows are ascending time
    for (let i = rows.length - 1; i >= 0 && out.length < 6; i--) {
      const r = rows[i];
      const key = String(r.lesson_key ?? r.lesson_slug ?? '');
      if (!key || seen.has(key)) continue;

      const pct = Number(r.final_percent ?? 0);
      const letter = letterFromPercent(pct);
      if (!PASSED.has(letter)) continue;

      seen.add(key);
      out.push({
        key,
        title: titleForKey(key),
        pct: Math.round(pct),
        letter,
        when: new Date(r.created_at).toISOString().slice(0, 10),
      });
    }
    return out;
  }, [baseRows]);

  const GradeChip = ({ pct, letter }: { pct: number; letter: string }) => {
    const dotColor = MASTERED.has(letter) ? PR_COLORS.noteFill : BLUE_COMPLETED;
    const label = `${pct}% ${letter}`;
    return (
      <span
        className="inline-flex h-6 w-[88px] items-center justify-center gap-1 rounded-full
                   bg-white text-[11px] font-semibold leading-none tabular-nums
                   shadow-sm ring-1 ring-[#3b82f6] border border-transparent whitespace-nowrap"
        title={label}
      >
        <span className="inline-block h-2 w-2 rounded-full" style={{ background: dotColor }} />
        <span className="truncate">{label}</span>
      </span>
    );
  };

  return (
    <div className="h-full rounded-2xl border border-[#d2d2d2] bg-gradient-to-b from-[#f2f2f2] to-[#eeeeee] p-6 shadow-sm flex flex-col">
      <div className="pb-3 border-b border-[#e5e7eb]">
        <h3 className="text-xl md:text-2xl font-semibold tracking-tight text-[#0f0f0f]">
          Completed Lessons
        </h3>
      </div>

      {loading ? (
        <div className="mt-3 flex-1 min-h-0">
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-14 rounded-xl bg-[#e8e8e8] animate-pulse" />
            ))}
          </div>
        </div>
      ) : recent.length === 0 ? (
        <div className="mt-3 flex-1 grid place-items-center text-base text-[#0f0f0f]">
          Complete a lesson to see it here.
        </div>
      ) : (
        <div className="mt-3 flex-1 min-h-0">
          <ul role="list" aria-label="Recent passed lessons" className="h-full overflow-auto">
            <div className="space-y-2">
              {recent.map((r) => (
                <li
                  key={r.key}
                  role="listitem"
                  className="relative rounded-xl border bg-gradient-to-b from-[#fafafa] to-[#f8f8f8]
                             px-4 py-3 pr-28 shadow-sm transition
                             hover:shadow-md hover:border-[#dcdcdc] focus-within:shadow-md focus-within:border-[#dcdcdc]"
                  style={{ borderColor: '#e5e7eb' }}
                  title={`${r.title} — ${r.when}`}
                >
                  <div className="absolute top-2 right-4">
                    <GradeChip pct={r.pct} letter={r.letter} />
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-[#0f0f0f] truncate">{r.title}</div>
                    <div className="text-xs text-[#0f0f0f]/65">{r.when}</div>
                  </div>
                </li>
              ))}
            </div>
          </ul>
        </div>
      )}

      {baseErr ? <div className="mt-3 text-sm text-[#dc2626]">{baseErr}</div> : null}
    </div>
  );
}
