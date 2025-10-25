// components/home/HomeCardGrid.tsx
'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import {
  CoursesIcon,
  SetupIcon,
  PremiumIcon,
  ProfileIcon,
} from '@/components/sidebar/svg/Icons';

type CardKey = 'courses' | 'setup' | 'premium' | 'profile';
type Card = { key: CardKey; title: string; subtitle?: string; href: string };

// Order: courses → setup → premium → profile
const CARDS: Card[] = [
  { key: 'courses', title: 'Courses', subtitle: 'Start singing with lessons built for your range', href: '/courses' },
  { key: 'setup',   title: 'Setup',   subtitle: 'Singing range & vision calibration', href: '/setup' },
  { key: 'premium', title: 'Pro',     subtitle: 'Unlock all features',        href: '/premium' },
  { key: 'profile', title: 'Settings', subtitle: 'Profile and gameplay controls',    href: '/profile' },
];

const ICON_MAP: Record<CardKey, React.ComponentType<React.SVGProps<SVGSVGElement>>> = {
  courses: CoursesIcon,
  setup: SetupIcon,
  premium: PremiumIcon,
  profile: ProfileIcon,
};

export default function HomeCardGrid({ variant = 'row' }: { variant?: 'row' | 'column' }) {
  const router = useRouter();
  const go = (href: string) => router.push(href);

  const containerClasses =
    variant === 'column'
      // 4 equal-height rows, small gaps, fill available height
      ? 'grid grid-rows-4 gap-2 h-full'
      // default responsive grid
      : 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4';

  return (
    <div className={containerClasses}>
      {CARDS.map((c) => {
        const Icon = ICON_MAP[c.key];
        return (
          <button
            key={c.key}
            onClick={() => go(c.href)}
            aria-label={c.title}
            className={[
              'group text-left rounded-2xl border border-[#d2d2d2] bg-gradient-to-b from-[#f2f2f2] to-[#eeeeee]',
              // Fill row height when stacked; fixed compact height otherwise
              variant === 'column' ? 'h-full p-4' : 'h-[90px] md:h-[96px] p-4',
              'w-full flex items-center justify-between gap-3',
              'hover:shadow-md shadow-sm active:scale-[0.99] transition',
              'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0f0f0f]',
            ].join(' ')}
          >
            {/* LEFT: icon + title on row 1; subtitle on row 2 */}
            <div className="min-w-0">
              <div className="flex items-center gap-2 min-w-0">
                {/* per-card SVG to the LEFT of the header text */}
                <Icon
                  aria-hidden
                  style={{ width: '1.25em', height: '1.25em', display: 'block' }}
                  className="shrink-0"
                />
                <div className="text-sm md:text-base font-semibold text-[#0f0f0f] truncate">
                  {c.title}
                </div>
              </div>

              {c.subtitle && (
                <div className="text-[11px] md:text-xs text-[#373737] mt-0.5 truncate">
                  {c.subtitle}
                </div>
              )}
            </div>

            {/* RIGHT: original chevron bubble (unchanged) */}
            <div
              className="shrink-0 rounded-full bg-[#f4f4f4] border border-[#e6e6e6] w-7 h-7 grid place-items-center
                         text-[#0f0f0f]/70 group-hover:text-[#0f0f0f] transition"
              aria-hidden
            >
              <svg width="16" height="16" viewBox="0 0 20 20" fill="none" className="-mr-0.5">
                <path d="M7.5 5l5 5-5 5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
          </button>
        );
      })}
    </div>
  );
}
