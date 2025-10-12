// lib/courses/progress.ts
export const PASS_THRESHOLD = 80;     // "completed"
export const MASTER_THRESHOLD = 90;   // "mastered"

export type LessonStatus = 'not-started' | 'started' | 'passed' | 'mastered';

export function statusFromBest(best: number | null | undefined): LessonStatus {
  if (best == null) return 'not-started';
  if (best >= MASTER_THRESHOLD) return 'mastered';
  if (best >= PASS_THRESHOLD) return 'passed';
  return 'started';
}
