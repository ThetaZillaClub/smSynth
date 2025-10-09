// components/game-navigation/CurriculumRouter.tsx
"use client";

import React, { useMemo, useState, useEffect, useCallback } from "react";
import useAppMode, { type ExerciseId } from "./hooks/useAppMode";
import CurriculumMenu from "./CurriculumMenu";
import TrainingGame from "@/components/training/TrainingGame";
import TrainingCurriculum from "@/components/training/TrainingCurriculum";
import RangeSetup from "@/components/setup/range/RangeSetup";
import VisionSetup from "@/components/setup/vision/VisionSetup";
import {
  DEFAULT_SESSION_CONFIG,
  type SessionConfig,
} from "@/components/training/session/types";
import useStudentRow from "@/hooks/students/useStudentRow";
import PitchTuneGame from "@/components/games/pitch-tune/PitchTuneGame";
import KeySignatureGame from "@/components/games/key-signature/KeySignatureGame";
import PitchTimeGame from "@/components/games/pitch-time/PitchTimeGame";

export default function CurriculumRouter({ studentId = null }: { studentId?: string | null }) {
  const { view, current, startExercise } = useAppMode();

  // Fetch ONCE here and reuse across subviews (prevents re-fetch on Back)
  const {
    studentRowId,
    studentName,
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
      case "pitch-tune":
        return (
          <PitchTuneGame
            studentId={studentId ?? null}
            studentRowId={studentRowId}
            studentName={studentName}
            rangeLowLabel={rangeLowLabel}
            rangeHighLabel={rangeHighLabel}
          />
        );

      case "key-signature":
        return (
          <KeySignatureGame
            studentId={studentId ?? null}
            studentRowId={studentRowId}
            studentName={studentName}
            rangeLowLabel={rangeLowLabel}
            rangeHighLabel={rangeHighLabel}
          />
        );

      case "pitch-time":
        return (
          <PitchTimeGame
            studentId={studentId ?? null}
            studentRowId={studentRowId}
            studentName={studentName}
            rangeLowLabel={rangeLowLabel}
            rangeHighLabel={rangeHighLabel}
          />
        );

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
            sessionConfig={sessionCfg}
            // pass everything so the child won't fetch
            studentRowId={studentRowId}
            rangeLowLabel={rangeLowLabel}
            rangeHighLabel={rangeHighLabel}
          />
        );

      case "range-setup":
        // RangeSetup still does an update flow by design
        return <RangeSetup studentId={studentId ?? null} />;

      case "vision-setup":
        return <VisionSetup />;

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
      <div className="h-full">{content}</div>
    </div>
  );
}
