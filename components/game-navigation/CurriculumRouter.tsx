// components/game-navigation/CurriculumRouter.tsx
"use client";

import React, { useMemo, useState, useEffect, useCallback } from "react";
import useAppMode, { type ExerciseId } from "./hooks/useAppMode";
import CurriculumMenu from "./CurriculumMenu";
import TrainingGame from "@/components/training/TrainingGame";
import TrainingCurriculum from "@/components/training/TrainingCurriculum";
import {
  DEFAULT_SESSION_CONFIG,
  type SessionConfig,
} from "@/components/training/layout/session/types";

type Props = {
  /** Student/model id from the URL; passed through to exercises that need it */
  studentId?: string | null;
};

/**
 * SPA router for curriculum:
 * - Full-screen menu (default)
 * - Selected exercise shows its curriculum first (universal layer)
 * - Then launches the in-game view with a floating Back control and injected session config
 */
export default function CurriculumRouter({ studentId = null }: Props) {
  const { view, current, startExercise, openMenu } = useAppMode();

  // Within an exercise, show a "curriculum" subview first, then "game"
  const [subview, setSubview] = useState<"curriculum" | "game">("curriculum");

  // Per-launch session config (owned here, passed down)
  const [sessionCfg, setSessionCfg] = useState<SessionConfig>(DEFAULT_SESSION_CONFIG);

  // Reset to curriculum whenever switching exercises or returning from menu
  useEffect(() => {
    setSubview("curriculum");
  }, [current, view]);

  const launchWith = useCallback((cfg: SessionConfig) => {
    setSessionCfg(cfg);
    setSubview("game");
  }, []);

  const content = useMemo(() => {
    switch (current as ExerciseId) {
      case "training-game":
        return subview === "curriculum" ? (
          <TrainingCurriculum onStart={launchWith} defaultConfig={sessionCfg} />
        ) : (
          <TrainingGame title="Training" studentId={studentId ?? null} sessionConfig={sessionCfg} />
        );
      default:
        return null;
    }
  }, [current, studentId, subview, sessionCfg, launchWith]);

  if (view === "menu") {
    return <CurriculumMenu studentId={studentId} onStart={startExercise} />;
  }

  // In-exercise wrapper with a floating back button that returns to menu
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
