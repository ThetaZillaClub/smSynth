// components/home/statsbento/LessonsCard.tsx
'use client';

import * as React from 'react';
import { letterFromPercent } from '@/utils/scoring/grade';
import { PR_COLORS } from '@/utils/stage';
import { COURSES } from '@/lib/courses/registry';
import { useHomeResults } from '@/components/home/data/HomeResultsProvider';

const PASSED = new Set(['A','A-','B+','B','B-']);
const MASTERED = new Set(['A','A+']); // A- is NOT mastery
const BLUE_COMPLETED = '#3b82f6';

const titleByLessonSlug: Record<string,string> = (() => {
  const m: Record<string,string> = {};
  for (const c of COURSES) for (const l of c.lessons) m[l.slug] = l.title;
  return m;
})();

export default function LessonsCard() {
  const { rows: baseRows, loading, error: baseErr } = useHomeResults();

  const recent = React.useMemo(() => {
    const rows = baseRows ?? [];

    // Most recent *unique* passed lessons (up to 6)
    const seen = new Set<string>();
    const out: Array<{ slug: string; title: string; pct: number; letter: string; when: string }> = [];
    for (let i = rows.length - 1; i >= 0 && out.length < 6; i--) {
      const r = rows[i];
      const slug = String(r.lesson_slug ?? '');
      if (!slug || seen.has(slug)) continue;

      const pct = Number(r.final_percent ?? 0);
      const letter = letterFromPercent(pct);
      if (PASSED.has(letter)) {
        seen.add(slug);
        out.push({
          slug,
          title: titleByLessonSlug[slug] ?? slug,
          pct: Math.round(pct),
          letter,
          when: new Date(r.created_at).toISOString().slice(0, 10),
        });
      }
    }
    return out;
  }, [baseRows]);

  /* Fixed-width progress bar so all rows align perfectly */
  const Progress = ({ pct }: { pct: number }) => (
    <div
      className="relative h-2 w-full rounded-full bg-[#e9e9e9] overflow-hidden"
      role="img"
      aria-label={`Progress ${Math.round(pct)} percent`}
      title={`${Math.round(pct)}%`}
    >
      <div
        className="absolute inset-y-0 left-0 rounded-full"
        style={{
          width: `${Math.max(0, Math.min(100, pct))}%`,
          background: 'linear-gradient(90deg, #bbf7d0, #22c55e)',
        }}
      />
    </div>
  );

  /* Grade chip: blue ring, dot color = mastered? green : blue; text "<percent>% <letter>" */
  const GradeChip = ({ pct, letter }: { pct: number; letter: string }) => {
    const dotColor = MASTERED.has(letter) ? PR_COLORS.noteFill : BLUE_COMPLETED;
    return (
      <span
        className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold bg-white shadow-sm ring-1 ring-[#3b82f6] border border-transparent whitespace-nowrap leading-tight"
        title={`${pct}% ${letter}`}
      >
        <span className="mr-1.5 inline-block h-2.5 w-2.5 rounded-full" style={{ background: dotColor }} />
        {pct}% {letter}
      </span>
    );
  };

  return (
    <div className="h-full rounded-2xl border border-[#d2d2d2] bg-gradient-to-b from-[#f2f2f2] to-[#eeeeee] p-6 shadow-sm flex flex-col">
      {/* Header — simple and contained */}
      <div className="pb-3 border-b border-[#e5e7eb]">
        <h3 className="text-xl md:text-2xl font-semibold tracking-tight text-[#0f0f0f]">
          Completed Lessons
        </h3>
      </div>

      {/* Body fills remaining height */}
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
                  key={r.slug}
                  role="listitem"
                  /* Compact two-line left column; fixed middle column keeps bars aligned */
                  className="grid grid-cols-[minmax(0,1fr)_8rem_auto] items-center gap-3
                             rounded-xl border bg-gradient-to-b from-[#fafafa] to-[#f8f8f8] px-4 py-3 shadow-sm transition
                             hover:shadow-md hover:border-[#dcdcdc] focus-within:shadow-md focus-within:border-[#dcdcdc]"
                  style={{ borderColor: '#e5e7eb' }}
                  title={`${r.title} — ${r.when}`}
                >
                  {/* Left: title + date (second line) */}
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-[#0f0f0f] truncate">{r.title}</div>
                    <div className="text-xs text-[#0f0f0f]/65">{r.when}</div>
                  </div>

                  {/* Middle: progress — fixed width so all bars line up */}
                  <div className="w-full">
                    <Progress pct={r.pct} />
                  </div>

                  {/* Right: grade chip with dot */}
                  <div className="justify-self-end">
                    <GradeChip pct={r.pct} letter={r.letter} />
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
