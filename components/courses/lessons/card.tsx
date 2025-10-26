// components/courses/lessons/card.tsx
'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import type { LessonDef } from '@/lib/courses/registry';
import { COURSES as REGISTRY } from '@/lib/courses/registry';
import useLessonBests from '@/hooks/progress/useLessonBests';
import { letterFromPercent } from '@/utils/scoring/grade';
import { PR_COLORS } from '@/utils/stage/theme';

type StatusKey = 'not-started' | 'started' | 'completed' | 'mastered';

function statusFromBest(best: number | null | undefined): { key: StatusKey; label: string } {
  if (best == null) return { key: 'not-started', label: 'Not started' };
  const l = letterFromPercent(best);
  if (['A', 'A-'].includes(l)) return { key: 'mastered', label: 'Mastered' };
  if (['B+', 'B', 'B-'].includes(l)) return { key: 'completed', label: 'Completed' };
  return { key: 'started', label: 'Started' };
}

// Unique plain slug?
const UNIQUE_SLUG = (() => {
  const counts = new Map<string, number>();
  for (const c of REGISTRY) for (const l of c.lessons) {
    counts.set(l.slug, (counts.get(l.slug) ?? 0) + 1);
  }
  const uniq = new Map<string, boolean>();
  for (const [slug, n] of counts) uniq.set(slug, n === 1);
  return uniq;
})();

export default function LessonsCard({
  courseSlug,
  lessons = [] as LessonDef[],
  basePath,
}: {
  courseSlug: string;
  lessons?: LessonDef[];
  basePath?: string; // default `/courses/${courseSlug}`
}) {
  const router = useRouter();
  const go = (slug: string) => router.push(`${basePath ?? `/courses/${courseSlug}`}/${slug}`);
  const { bests } = useLessonBests();

  const bestsSafe = (bests ?? {}) as Record<string, number | undefined>;
  const safeLessons = Array.isArray(lessons) ? lessons : [];

  return (
    <div className="grid grid-cols-1 gap-4 md:gap-5">
      {safeLessons.map((l) => {
        const namespaced = `${courseSlug}/${l.slug}`;
        const best =
          bestsSafe[namespaced] ??
          (UNIQUE_SLUG.get(l.slug) ? bestsSafe[l.slug] : undefined);

        const { key, label } = statusFromBest(best ?? null);
        const letter = best != null ? letterFromPercent(best) : null;

        const chipBorder =
          key === 'mastered' ? PR_COLORS.noteFill :
          key === 'completed' ? PR_COLORS.dotFill :
          PR_COLORS.gridMinor;
        const chipDot =
          key === 'mastered' ? PR_COLORS.noteFill :
          key === 'completed' ? PR_COLORS.dotFill :
          key === 'started' ? PR_COLORS.dotFill :
          PR_COLORS.gridMinor;

        return (
          <button
            key={l.slug}
            type="button"
            onClick={() => go(l.slug)}
            className={[
              'relative w-full text-left rounded-2xl border p-6 md:p-7',
              'border bg-gradient-to-b from-[#fafafa] to-[#f8f8f8]',
              'border-[#d2d2d2] hover:shadow-md shadow-sm active:scale-[0.99] transition',
              'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0f0f0f]',
            ].join(' ')}
            title={`Open lesson: ${l.title}`}
          >
            <div className="flex items-start justify-between gap-6">
              <div className="min-w-0">
                <div className="text-2xl font-semibold text-[#0f0f0f] truncate">{l.title}</div>
                {!!l.summary && <div className="mt-1 text-base text-[#0f0f0f] line-clamp-2">{l.summary}</div>}
              </div>

              <span
                className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm font-medium bg-[#f8f8f8]"
                style={{ borderColor: chipBorder, color: '#0f0f0f' }}
              >
                <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: chipDot }} aria-hidden />
                <span className="leading-none">{label}</span>
                {best != null ? (
                  <span className="leading-none opacity-90">
                    · {Math.round(best)}%{letter ? ` (${letter})` : ''}
                  </span>
                ) : null}
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
}
