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
    // Empty state
    return (
      <div className="rounded-xl border border-[#dcdcdc] bg-[#fbfbfb] p-5">
        <h3 className="text-lg font-semibold">No courses in progress</h3>
        <p className="mt-1 text-sm text-[#373737]">
          When you start a course, it’ll appear here so you can quickly continue.
        </p>
        <div className="mt-4">
          <button
            type="button"
            onClick={() => go('pitch-tune')}
            className="inline-flex items-center gap-1 rounded-lg bg-[#0f0f0f] text-white px-4 py-2 text-sm hover:opacity-90 active:scale-[0.99] transition"
          >
            Try Pitch Tune <span aria-hidden>↗</span>
          </button>
        </div>
      </div>
    );
  }

  // Active course card
  return (
    <div className="rounded-xl border border-[#dcdcdc] bg-white p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-sm uppercase tracking-wide text-[#373737]">Continue</div>
          <div className="mt-1 text-xl font-semibold text-[#0f0f0f]">{activeCourse.title}</div>
          {activeCourse.subtitle && (
            <div className="mt-1 text-sm text-[#373737]">{activeCourse.subtitle}</div>
          )}
        </div>
        <div>
          <button
            type="button"
            onClick={() => go(activeCourse.slug)}
            className="inline-flex items-center gap-1 rounded-lg bg-[#0f0f0f] text-white px-4 py-2 text-sm hover:opacity-90 active:scale-[0.99] transition"
          >
            Resume <span aria-hidden>↗</span>
          </button>
        </div>
      </div>
    </div>
  );
}
