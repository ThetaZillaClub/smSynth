'use client';

import * as React from 'react';
import CoursesLayout from '@/components/courses/courses-layout';

export type Course = { slug: string; title: string; subtitle?: string };

const COURSES: Course[] = [
  { slug: 'pitch-tune',          title: 'Pitch Tune',          subtitle: 'Single-pitch call & response' },
  { slug: 'pitch-time',          title: 'Pitch Time',          subtitle: 'Guided arpeggio by ear' },
  { slug: 'intervals',           title: 'Intervals',           subtitle: 'Hear & sing steps' },
  { slug: 'interval-detection',  title: 'Interval Detection',  subtitle: 'Listening drills' },
  { slug: 'scales',              title: 'Scales',              subtitle: 'Within-key scale work' },
  { slug: 'key-detection',       title: 'Key Detection',       subtitle: 'Find the key by ear' },
  { slug: 'scales-rhythms',      title: 'Scales & Rhythms',    subtitle: 'Rhythm-forward scale work' },
];

export default function CoursesPage() {
  return <CoursesLayout courses={COURSES} />;
}
