'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import type { Course } from '@/app/courses/page';

export default function AllCoursesCard({ courses }: { courses: Course[] }) {
  const router = useRouter();
  const go = (slug: string) => router.push(`/courses/${slug}`);

  return (
    <div>
      {/* smaller quicker: earlier column bumps + tighter gaps */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-2 gap-3 sm:gap-4 md:gap-5">
        {courses.map((c) => (
          <button
            key={c.slug}
            onClick={() => go(c.slug)}
            className={[
              // portrait tiles: taller than wide
              'group text-left rounded-xl bg-white border border-[#dcdcdc]',
              // fixed portrait aspect to read like a larger library
              'aspect-[3/2] min-h-[220px]',
              // internal layout
              'p-4 md:p-5 flex flex-col items-start justify-between',
              'hover:shadow-md active:scale-[0.99] transition',
            ].join(' ')}
          >
            <div>
              <div className="text-lg md:text-xl font-semibold text-[#0f0f0f]">
                {c.title}
              </div>
              {c.subtitle && (
                <div className="text-xs md:text-sm text-[#373737] mt-1">
                  {c.subtitle}
                </div>
              )}
            </div>

            <div className="inline-flex items-center gap-1 text-sm text-[#0f0f0f]">
              Start <span aria-hidden>↗</span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
