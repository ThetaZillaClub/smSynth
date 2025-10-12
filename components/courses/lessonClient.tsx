// components/courses/lessonClient.tsx
'use client';

import * as React from 'react';
import { useParams } from 'next/navigation';
import TrainingGame from '@/components/training/TrainingGame';
import useStudentRow from '@/hooks/students/useStudentRow';
import useStudentRange from '@/hooks/students/useStudentRange';
import { resolveLessonToSession } from '@/utils/lessons/resolve';
import type { SessionConfig } from '@/components/training/session';

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
  const lessonSlug = (params?.lesson ?? null) as string | null;

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

  // Stable per-mount session id (browser only)
  const sessionIdRef = React.useRef<string | null>(null);
  if (!sessionIdRef.current) {
    sessionIdRef.current =
      (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

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
