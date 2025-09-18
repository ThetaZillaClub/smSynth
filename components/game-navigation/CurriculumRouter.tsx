// components/game-navigation/CurriculumRouter.tsx
"use client";

import React, { useMemo, useState, useEffect, useCallback } from "react";
import useAppMode, { type ExerciseId } from "./hooks/useAppMode";
import CurriculumMenu from "./CurriculumMenu";
import TrainingGame from "@/components/training/TrainingGame";
import TrainingCurriculum from "@/components/training/TrainingCurriculum";
import RangeSetup from "@/components/range/RangeSetup"; // NEW
import {
  DEFAULT_SESSION_CONFIG,
  type SessionConfig,
} from "@/components/training/layout/session/types";

export default function CurriculumRouter({ studentId = null }: { studentId?: string | null }) {
  const { view, current, startExercise, openMenu } = useAppMode();

  const [subview, setSubview] = useState<"curriculum" | "game">("curriculum");
  const [sessionCfg, setSessionCfg] = useState<SessionConfig>(DEFAULT_SESSION_CONFIG);

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

      case "range-setup":
        // standalone screen — no curriculum step needed
        return <RangeSetup studentId={studentId ?? null} />;

      default:
        return null;
    }
  }, [current, studentId, subview, sessionCfg, launchWith]);

  if (view === "menu") {
    return <CurriculumMenu studentId={studentId} onStart={startExercise} />;
  }

  return (
    <div className="relative min-h-dvh h-dvh bg-[#f0f0f0]">
      <div className="fixed left-4 top-4 z-50">
        <button
          type="button"
          onClick={openMenu}
          className="px-3 h-10 rounded-lg bg-black/80 text-white text-sm shadow-lg backdrop-blur hover:bg黑"
          title="Back to menu"
        >
          ← Back to Menu
        </button>
      </div>
      <div className="h-full">{content}</div>
    </div>
  );
}
