'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';

type Card = { key: string; title: string; subtitle?: string; href: string };

const CARDS: Card[] = [
  { key: 'setup',   title: 'Setup',   subtitle: 'Range & vision calibration', href: '/setup' },
  { key: 'courses', title: 'Courses', subtitle: 'Start or continue lessons',   href: '/courses' },
  { key: 'profile', title: 'Profile', subtitle: 'Name, students & models',     href: '/profile' },
];

export default function HomeCardGrid() {
  const router = useRouter();
  const go = (href: string) => router.push(href);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 md:gap-5">
      {CARDS.map((c) => (
        <button
          key={c.key}
          onClick={() => go(c.href)}
          className={[
            // match AllCoursesCard look, just smaller and 3-up
            'group text-left rounded-xl bg-[#f9f9f9] border border-[#dcdcdc]',
            'aspect-[4/3] min-h-[160px]',
            'p-4 md:p-5 flex flex-col items-start justify-between',
            'hover:shadow-md shadow-sm active:scale-[0.99] transition',
            'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0f0f0f]',
          ].join(' ')}
        >
          <div>
            <div className="text-lg font-semibold text-[#0f0f0f]">{c.title}</div>
            {c.subtitle && (
              <div className="text-xs md:text-sm text-[#373737] mt-1">{c.subtitle}</div>
            )}
          </div>
        </button>
      ))}
    </div>
  );
}
