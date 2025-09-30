'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';

type Course = { slug: string; title: string; subtitle?: string };

const COURSES: Course[] = [
  { slug: 'pitch-tune',          title: 'Pitch Tune',          subtitle: 'Single-pitch call & response' },
  { slug: 'pitch-time',          title: 'Pitch Time',          subtitle: 'Guided arpeggio by ear' },
  { slug: 'intervals',           title: 'Intervals',           subtitle: 'Hear & sing steps' },
  { slug: 'interval-detection',  title: 'Interval Detection',  subtitle: 'Listening drills' },
  { slug: 'scales',              title: 'Scales',              subtitle: 'Within-key scale work' },
  { slug: 'key-detection',       title: 'Key Detection',       subtitle: 'Find the key by ear' },
  { slug: 'scales-rhythms',      title: 'Scales & Rhythms',    subtitle: 'Rhythm-forward scale work' },
];

function mapSlugToExerciseId(slug: string): string {
  switch (slug) {
    case 'pitch-tune': return 'pitch-tune';
    case 'pitch-time': return 'pitch-time';
    case 'intervals': return 'interval-beginner';
    case 'interval-detection': return 'interval-detection';
    case 'scales': return 'scale-singing-key';
    case 'key-detection': return 'keysig-detection';
    case 'scales-rhythms':
    case 'scale-rhythm': return 'scale-singing-syncopation';
    default: return 'training-game';
  }
}

export default function CoursesPage() {
  const router = useRouter();

  const go = (slug: string) => {
    const id = mapSlugToExerciseId(slug);
    try {
      localStorage.setItem('appmode:v2', JSON.stringify({ view: 'menu', current: id }));
    } catch {}
    router.push('/training');
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#f0f0f0] to-[#d2d2d2] text-[#0f0f0f]">
      <div className="px-6 pt-8 pb-10 max-w-7xl mx-auto">
        <h1 className="text-3xl font-bold text-[#0f0f0f]">Courses</h1>
        <p className="text-sm text-[#0f0f0f] mt-1">Pick a course to practice. You’ll land in the training curriculum.</p>

        <div className="mt-6 grid gap-4 sm:gap-5 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {COURSES.map((c) => (
            <button
              key={c.slug}
              onClick={() => go(c.slug)}
              className="text-left rounded-xl bg-white border border-[#dcdcdc] p-5 hover:shadow-md active:scale-[0.99] transition"
            >
              <div className="text-xl font-semibold text-[#0f0f0f]">{c.title}</div>
              {c.subtitle && <div className="text-sm text-[#0f0f0f] mt-1">{c.subtitle}</div>}
              <div className="mt-3 inline-flex items-center gap-1 text-sm text-[#0f0f0f]">
                Start <span aria-hidden>↗</span>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
