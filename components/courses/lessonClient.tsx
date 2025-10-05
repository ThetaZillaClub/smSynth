// components/courses/LessonClient.tsx
'use client';

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
  const { studentRowId, studentName, genderLabel, rangeLowLabel, rangeHighLabel } =
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

  return (
    <TrainingGame
      title={`${courseTitle} — ${lessonTitle}`}
      sessionConfig={sessionConfig}
      studentRowId={studentRowId}
      studentName={studentName}
      genderLabel={genderLabel}
      rangeLowLabel={rangeLowLabel}
      rangeHighLabel={rangeHighLabel}
    />
  );
}
