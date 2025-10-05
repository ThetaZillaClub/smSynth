// components/courses/courses-layout.tsx
'use client';

import * as React from 'react';
import type { Course } from '@/app/courses/page';
import Header from './header/header';
import InProgressCard from './in-progress/card';
import AllCoursesCard from './all-courses/card';

type TabKey = 'in-progress' | 'all-courses';

export default function CoursesLayout({
  courses,
  children,
  title = 'Courses',
}: {
  courses?: Course[];
  children?: React.ReactNode;
  title?: string;
}) {
  const [tab, setTab] = React.useState<TabKey>('in-progress');

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
        'h-dvh',
        'overflow-y-scroll',
        'supports-[scrollbar-gutter:stable]:overflow-y-auto',
        'supports-[scrollbar-gutter:stable]:[scrollbar-gutter:stable]',
        'bg-gradient-to-b from-[#f0f0f0] to-[#d2d2d2] text-[#0f0f0f]',
      ].join(' ')}
    >
      <div className="px-6 pt-8 pb-10 max-w-7xl mx-auto">
        <h1 className="text-3xl font-bold text-[#0f0f0f]">{title}</h1>

        <div className="mt-4 rounded-2xl overflow-hidden bg-[#eeeeee] border border-[#d7d7d7]">
          {children ? (
            // Course detail mode: just render the provided content inside the same chrome
            <div className="p-4 md:p-6">{children}</div>
          ) : (
            // Home mode: tabs + cards
            <>
              <Header active={tab} onChange={setTab} />
              <div className="p-4 md:p-6">
                {tab === 'in-progress' ? (
                  <InProgressCard courses={courses ?? []} />
                ) : (
                  <AllCoursesCard courses={courses ?? []} />
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
