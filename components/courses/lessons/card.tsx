// components/courses/lessons/card.tsx
'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import type { LessonDef } from '@/lib/courses/registry';

export default function LessonsCard({
  courseSlug,
  lessons,
  basePath,
}: {
  courseSlug: string;
  lessons: LessonDef[];
  basePath?: string; // default `/courses/${courseSlug}`
}) {
  const router = useRouter();
  const go = (slug: string) =>
    router.push(`${basePath ?? `/courses/${courseSlug}`}/${slug}`);

  return (
    <div className="grid grid-cols-1 gap-3 sm:gap-4 md:gap-5">
      {lessons.map((l) => (
        <button
          key={l.slug}
          type="button"
          onClick={() => go(l.slug)}
          className={[
            'w-full text-left rounded-xl border border-[#dcdcdc] bg-white p-5',
            'hover:shadow-md shadow-sm active:scale-[0.99] transition',
            'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0f0f0f]',
          ].join(' ')}
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-xl font-semibold text-[#0f0f0f]">
                {l.title}
              </div>
              {!!l.summary && (
                <div className="mt-1 text-sm text-[#373737]">{l.summary}</div>
              )}
            </div>
            {/* No right-side CTA to mirror InProgressCard; hover/active styles imply click */}
          </div>
        </button>
      ))}
    </div>
  );
}
