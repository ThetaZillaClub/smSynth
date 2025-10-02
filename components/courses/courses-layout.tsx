// components/courses/courses-layout.tsx
'use client';

import * as React from 'react';
import type { Course } from '@/app/courses/page';
import Header from './header/header';
import InProgressCard from './in-progress/card';
import AllCoursesCard from './all-courses/card';

type TabKey = 'in-progress' | 'all-courses';

export default function CoursesLayout({ courses }: { courses: Course[] }) {
  const [tab, setTab] = React.useState<TabKey>('in-progress');

  // Make THIS page the ONLY scroll container.
  React.useEffect(() => {
    document.documentElement.classList.add('overflow-hidden');
    document.body.classList.add('overflow-hidden');
    return () => {
      document.documentElement.classList.remove('overflow-hidden');
      document.body.classList.remove('overflow-hidden');
    };
  }, []);

  return (
    <div
      className={[
        // Fill the viewport and be the sole scroller
        'h-dvh',
        // Fallback: always show a bar so width is stable in older browsers
        'overflow-y-scroll',
        // If supported, use a stable gutter and let the bar show only when needed
        'supports-[scrollbar-gutter:stable]:overflow-y-auto',
        'supports-[scrollbar-gutter:stable]:[scrollbar-gutter:stable]',
        // your styles
        'bg-gradient-to-b from-[#f0f0f0] to-[#d2d2d2] text-[#0f0f0f]'
      ].join(' ')}
    >
      <div className="px-6 pt-8 pb-10 max-w-7xl mx-auto">
        <h1 className="text-3xl font-bold text-[#0f0f0f]">Courses</h1>

        <div className="mt-4 rounded-2xl overflow-hidden bg-[#eeeeee] border border-[#d7d7d7]">
          <Header active={tab} onChange={setTab} />
          <div className="p-4 md:p-6">
            {tab === 'in-progress' ? (
              <InProgressCard courses={courses} />
            ) : (
              <AllCoursesCard courses={courses} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
