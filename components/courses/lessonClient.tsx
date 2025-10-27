// components/courses/lessonClient.tsx
'use client';

import * as React from 'react';
import { useParams, useRouter } from 'next/navigation';
import TrainingGame from '@/components/training/TrainingGame';
import useStudentRow from '@/hooks/students/useStudentRow';
import useStudentRange from '@/hooks/students/useStudentRange';
import { resolveLessonToSession } from '@/utils/lessons/resolve';
import type { SessionConfig } from '@/components/training/session';
import { fetchJsonNoStore } from '@/components/sidebar/fetch/noStore';

export default function LessonClient({
  courseTitle,
  lessonTitle,
  lessonConfig,
}: {
  courseTitle: string;
  lessonTitle: string;
  lessonConfig: Partial<SessionConfig>;
}) {
  const params = useParams<{ course: string; lesson: string }>();
  const router = useRouter();

  const courseSlug = (params?.course ?? null) as string | null;
  const lessonSlugOnly = (params?.lesson ?? null) as string | null;

  const lessonSlug = courseSlug && lessonSlugOnly
    ? `${courseSlug}/${lessonSlugOnly}` // namespaced key for storage
    : lessonSlugOnly;

  // Destination used if we need to bounce to range setup
  const nextDest = React.useMemo(
    () => (courseSlug && lessonSlugOnly ? `/courses/${courseSlug}/${lessonSlugOnly}` : '/courses'),
    [courseSlug, lessonSlugOnly]
  );

  // Range gate status (keep hook order stable; do not early-return before other hooks)
  const [gate, setGate] = React.useState<'checking' | 'ok' | 'redirect'>('checking');

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      const row = await fetchJsonNoStore<{ range_low: string | null; range_high: string | null }>(
        '/api/students/current/range'
      );
      const ready =
        !!row &&
        typeof row.range_low === 'string' &&
        !!row.range_low &&
        typeof row.range_high === 'string' &&
        !!row.range_high;

      if (!ready) {
        // Mark redirect (prevents flicker) then navigate
        if (!cancelled) setGate('redirect');
        router.replace(`/setup/range?next=${encodeURIComponent(nextDest)}`);
        return;
      }
      if (!cancelled) setGate('ok');
    })();
    return () => {
      cancelled = true;
    };
  }, [router, nextDest]);

  // --- From here down: always-called hooks (order is stable across renders) ---
  const { studentRowId, rangeLowLabel, rangeHighLabel } =
    useStudentRow({ studentIdFromQuery: null });

  const { lowHz, highHz } = useStudentRange(studentRowId, {
    rangeLowLabel,
    rangeHighLabel,
  });

  const sessionConfig = resolveLessonToSession(
    lessonConfig,
    { lowHz: lowHz ?? null, highHz: highHz ?? null },
    { autoSelectWindowIfMissing: true, clampKeyToRange: true }
  );

  const sessionIdRef = React.useRef<string | null>(null);
  if (!sessionIdRef.current) {
    sessionIdRef.current =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  // If we’re checking or already redirecting, render nothing (but hooks were still called).
  if (gate !== 'ok') return null;

  return (
    <TrainingGame
      title={`${courseTitle} — ${lessonTitle}`}
      sessionConfig={sessionConfig}
      studentRowId={studentRowId}
      rangeLowLabel={rangeLowLabel}
      rangeHighLabel={rangeHighLabel}
      lessonSlug={lessonSlug}
      sessionId={sessionIdRef.current}
    />
  );
}
