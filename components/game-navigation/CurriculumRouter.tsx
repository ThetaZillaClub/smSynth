// components/game-navigation/CurriculumRouter.tsx
"use client";

import React, { useMemo, useState, useEffect, useCallback } from "react";
import useAppMode, { type ExerciseId } from "./hooks/useAppMode";
import CurriculumMenu from "./CurriculumMenu";
import TrainingGame from "@/components/training/TrainingGame";
import TrainingCurriculum from "@/components/training/TrainingCurriculum";
import RangeSetup from "@/components/range/RangeSetup";
import {
  DEFAULT_SESSION_CONFIG,
  type SessionConfig,
} from "@/components/training/session/types";
import useStudentRow from "@/hooks/students/useStudentRow";

export default function CurriculumRouter({ studentId = null }: { studentId?: string | null }) {
  const { view, current, startExercise, openMenu } = useAppMode();

  // Fetch ONCE here and reuse across subviews (prevents re-fetch on Back)
  const {
    studentRowId,
    studentName,
    genderLabel,
    rangeLowLabel,
    rangeHighLabel,
  } = useStudentRow({ studentIdFromQuery: studentId ?? null });

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
          <TrainingCurriculum
            onStart={launchWith}
            defaultConfig={sessionCfg}
            // pass range labels so the child won't fetch
            rangeLowLabel={rangeLowLabel}
            rangeHighLabel={rangeHighLabel}
          />
        ) : (
          <TrainingGame
            title="Training"
            // keep for downstream query param compatibility if needed
            studentId={studentId ?? null}
            sessionConfig={sessionCfg}
            // pass everything so the child won't fetch
            studentRowId={studentRowId}
            studentName={studentName}
            genderLabel={genderLabel}
            rangeLowLabel={rangeLowLabel}
            rangeHighLabel={rangeHighLabel}
          />
        );

      case "range-setup":
        // RangeSetup still does an update flow by design
        return <RangeSetup studentId={studentId ?? null} />;

      default:
        return null;
    }
  }, [
    current,
    studentId,
    subview,
    sessionCfg,
    launchWith,
    studentRowId,
    studentName,
    genderLabel,
    rangeLowLabel,
    rangeHighLabel,
  ]);

  if (view === "menu") {
    return (
      <CurriculumMenu
        studentId={studentId}
        studentName={studentName}
        onStart={startExercise}
      />
    );
  }

  return (
    <div className="relative min-h-dvh h-dvh bg-[#f0f0f0]">
      <div className="fixed left-4 top-4 z-50">
        <button
          type="button"
          onClick={openMenu}
          className="px-4 py-2 rounded-md border border-[#d2d2d2] bg-[#f0f0f0] text-[#0f0f0f] text-sm hover:bg-white transition shadow-sm"
          title="Back to menu"
          aria-label="Back to menu"
        >
          ← Back to Menu
        </button>
      </div>
      <div className="h-full">{content}</div>
    </div>
  );
}
