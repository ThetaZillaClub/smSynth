'use client';

import * as React from 'react';
import CoursesLayout from '@/components/courses/courses-layout';
import { COURSES as REGISTRY } from '@/lib/courses/registry';

export type Course = { slug: string; title: string; subtitle?: string };

const COURSES: Course[] = REGISTRY.map(c => ({
  slug: c.slug,
  title: c.title,
  subtitle: c.subtitle,
}));

export default function CoursesPage() {
  return <CoursesLayout courses={COURSES} />;
}
