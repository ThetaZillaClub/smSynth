'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';

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

export default function CourseSlugPage() {
  const { slug } = useParams<{ slug: string }>();
  const router = useRouter();

  useEffect(() => {
    const id = mapSlugToExerciseId(slug);
    try { localStorage.setItem('appmode:v2', JSON.stringify({ view: 'menu', current: id })); } catch {}
    router.replace('/training');
  }, [slug, router]);

  return null;
}
