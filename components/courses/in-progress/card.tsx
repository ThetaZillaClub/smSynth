'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import type { Course } from '@/app/courses/page';

type AppModeV2 = { view?: string; current?: string } | null;

const exerciseIdToSlug: Record<string, string> = {
  'pitch-tune': 'pitch-tune',
  'pitch-time': 'pitch-time',
  'interval-beginner': 'intervals',
  'interval-detection': 'interval-detection',
  'scale-singing-key': 'scales',
  'keysig-detection': 'key-detection',
  'scale-singing-syncopation': 'scales-rhythms',
};

export default function InProgressCard({ courses }: { courses: Course[] }) {
  const router = useRouter();
  const [slug, setSlug] = React.useState<string | null>(null);

  React.useEffect(() => {
    // Try to infer the user's most recent course from the legacy menu state.
    try {
      const raw = localStorage.getItem('appmode:v2');
      const parsed: AppModeV2 = raw ? JSON.parse(raw) : null;
      const id = parsed?.current;
      if (id && exerciseIdToSlug[id]) {
        setSlug(exerciseIdToSlug[id]);
      } else {
        setSlug(null);
      }
    } catch {
      setSlug(null);
    }
  }, []);

  const activeCourse = slug ? courses.find((c) => c.slug === slug) : undefined;

  const go = (s: string) => {
    // Route via slug so we keep the legacy redirect behavior for now.
    router.push(`/courses/${s}`);
  };

  if (!activeCourse) {
    // Empty state (no CTA button)
    return (
      <div className="rounded-xl border border-[#dcdcdc] bg-[#f2f2f2] p-5 shadow-sm">
        <h3 className="text-lg font-semibold">No courses in progress</h3>
        <p className="mt-1 text-sm text-[#373737]">
          When you start a course, it’ll appear here so you can quickly continue.
        </p>
      </div>
    );
  }

  // Active course card: whole card is interactive (no Resume button)
  return (
    <button
      type="button"
      onClick={() => go(activeCourse.slug)}
      className={[
        'w-full text-left rounded-xl border border-[#dcdcdc] bg-white p-5',
        'hover:shadow-md shadow-sm active:scale-[0.99] transition',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0f0f0f]',
      ].join(' ')}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-sm uppercase tracking-wide text-[#373737]">Continue</div>
          <div className="mt-1 text-xl font-semibold text-[#0f0f0f]">
            {activeCourse.title}
          </div>
          {activeCourse.subtitle && (
            <div className="mt-1 text-sm text-[#373737]">
              {activeCourse.subtitle}
            </div>
          )}
        </div>
        {/* Right side CTA removed; rely on card hover/active styles */}
      </div>
    </button>
  );
}
