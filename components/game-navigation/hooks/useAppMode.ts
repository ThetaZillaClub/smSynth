// components/game-navigation/hooks/useAppMode.ts
"use client";

import { useEffect, useMemo, useState, useCallback } from "react";

export type ExerciseId =
  | "range-setup"
  | "vision-setup"
  | "training-game"
  | "interval-beginner"
  | "interval-scales"
  | "interval-detection"
  | "keysig-detection"
  | "scale-singing-key"
  | "scale-singing-syncopation"
  | "advanced-syncopation";

export type AppView = "menu" | "exercise";

type PersistShapeV2 = { view: AppView; current: ExerciseId };

// Keep backward compat with the old v1 shape { current }
const KEY = "appmode:v2";
const LEGACY_KEY = "appmode:v1";

const DEFAULT: PersistShapeV2 = { view: "menu", current: "training-game" };

function load(): PersistShapeV2 {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const v = JSON.parse(raw) as Partial<PersistShapeV2> | null;
      const view = (v?.view as AppView) ?? DEFAULT.view;
      const current = (v?.current as ExerciseId) ?? DEFAULT.current;
      return { view, current };
    }
    // migrate from v1 if present
    const legacy = localStorage.getItem(LEGACY_KEY);
    if (legacy) {
      const v = JSON.parse(legacy) as { current?: ExerciseId } | null;
      return { view: "menu", current: (v?.current as ExerciseId) ?? DEFAULT.current };
    }
  } catch {}
  return DEFAULT;
}

function save(v: PersistShapeV2) {
  try {
    localStorage.setItem(KEY, JSON.stringify(v));
  } catch {}
}

/** Global in-SPA app mode: full-screen menu vs. in-exercise, and which exercise is selected */
export default function useAppMode() {
  const [view, setView] = useState<AppView>(DEFAULT.view);
  const [current, setCurrent] = useState<ExerciseId>(DEFAULT.current);

  // hydrate on mount
  useEffect(() => {
    const v = load();
    setView(v.view);
    setCurrent(v.current);
  }, []);

  // persist whenever either changes
  useEffect(() => {
    save({ view, current });
  }, [view, current]);

  const startExercise = useCallback((id: ExerciseId) => {
    setCurrent(id);
    setView("exercise");
  }, []);

  const openMenu = useCallback(() => setView("menu"), []);

  // Keep this for cases where you want to switch within the exercise shell
  const setExercise = useCallback((id: ExerciseId) => setCurrent(id), []);

  return useMemo(
    () => ({ view, current, setExercise, startExercise, openMenu }),
    [view, current, startExercise, openMenu, setExercise]
  );
}
