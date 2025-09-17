// components/game-navigation/CurriculumRouter.tsx
"use client";

import React, { useMemo } from "react";
import useAppMode, { type ExerciseId } from "./hooks/useAppMode";
import CurriculumMenu from "./CurriculumMenu";
import TrainingGame from "@/components/training/TrainingGame";

type Props = {
  /** Student/model id from the URL; passed through to exercises that need it */
  studentId?: string | null;
};

/**
 * SPA router for curriculum:
 * - Full-screen menu (default)
 * - Selected exercise in an "in-game" view with a floating Back control
 */
export default function CurriculumRouter({ studentId = null }: Props) {
  const { view, current, startExercise, openMenu } = useAppMode();

  const content = useMemo(() => {
    switch (current as ExerciseId) {
      case "training-game":
      default:
        return <TrainingGame title="Training" studentId={studentId ?? null} />;
    }
  }, [current, studentId]);

  if (view === "menu") {
    return <CurriculumMenu studentId={studentId} onStart={startExercise} />;
  }

  // In-game wrapper with a floating back button that returns to menu
  return (
    <div className="relative min-h-dvh h-dvh bg-[#f0f0f0]">
      {/* Floating back to menu */}
      <div className="fixed left-4 top-4 z-50">
        <button
          type="button"
          onClick={openMenu}
          className="px-3 h-10 rounded-lg bg-black/80 text-white text-sm shadow-lg backdrop-blur hover:bg-black"
          title="Back to menu"
        >
          ← Back to Menu
        </button>
      </div>

      {/* Exercise content */}
      <div className="h-full">{content}</div>
    </div>
  );
}
