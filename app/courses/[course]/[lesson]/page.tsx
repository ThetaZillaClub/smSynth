'use client';

import { useParams } from 'next/navigation';
import { findLesson } from '@/lib/courses/registry';
import TrainingGame from '@/components/training/TrainingGame';
import useStudentRow from '@/hooks/students/useStudentRow';
import useStudentRange from '@/hooks/students/useStudentRange';
import { resolveLessonToSession } from '@/utils/lessons/resolve';

export default function LessonPage() {
  const { course, lesson } = useParams<{ course: string; lesson: string }>();
  const hit = findLesson(course, lesson);

  // Support only config-driven courses here.
  if (!hit) {
    return <div className="p-6">Lesson not found.</div>;
  }

  // Optional: if you pass studentId via query (?student_id=...), useStudentRow can pick it up;
  // here we just fetch the "current" student row model as in your existing router.
  const { studentRowId, studentName, genderLabel, rangeLowLabel, rangeHighLabel } = useStudentRow({ studentIdFromQuery: null });

  // Pull numeric range to resolve random key/window *before* rendering the game (nice but optional).
  const { lowHz, highHz } = useStudentRange(studentRowId, { rangeLowLabel, rangeHighLabel });

  const sessionConfig = resolveLessonToSession(
    hit.lesson.config,
    { lowHz: lowHz ?? null, highHz: highHz ?? null },
    { autoSelectWindowIfMissing: true, clampKeyToRange: true }
  );

  return (
    <TrainingGame
      title={`${hit.course.title} — ${hit.lesson.title}`}
      sessionConfig={sessionConfig}
      studentRowId={studentRowId}
      studentName={studentName}
      genderLabel={genderLabel}
      rangeLowLabel={rangeLowLabel}
      rangeHighLabel={rangeHighLabel}
    />
  );
}
