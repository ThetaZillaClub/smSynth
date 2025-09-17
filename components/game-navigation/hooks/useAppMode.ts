// components/game-navigation/hooks/useAppMode.ts
"use client";

import { useEffect, useMemo, useState } from "react";

export type ExerciseId =
  | "range-setup"
  | "training-game"
  | "interval-beginner"
  | "interval-scales"
  | "interval-detection"
  | "keysig-detection"
  | "scale-singing-key"
  | "scale-singing-syncopation"
  | "advanced-syncopation";

type AppView = "menu" | "exercise";

type PersistShape = { current: ExerciseId; view: AppView };

const KEY = "appmode:v2";
const DEFAULT: PersistShape = { current: "training-game", view: "menu" };

function load(): PersistShape {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT;
    const v = JSON.parse(raw) as Partial<PersistShape> | null;
    const cur = (v?.current as ExerciseId) ?? DEFAULT.current;
    const view = (v?.view as AppView) ?? "menu";
    return { current: cur, view };
  } catch {
    return DEFAULT;
  }
}

function save(v: PersistShape) {
  try {
    localStorage.setItem(KEY, JSON.stringify(v));
  } catch {}
}

/** SPA exercise selector + simple view state for full-screen menu vs. in-game. */
export default function useAppMode() {
  const [current, setCurrent] = useState<ExerciseId>(DEFAULT.current);
  const [view, setView] = useState<AppView>(DEFAULT.view);

  useEffect(() => {
    const v = load();
    setCurrent(v.current);
    setView(v.view);
  }, []);

  useEffect(() => {
    save({ current, view });
  }, [current, view]);

  return useMemo(
    () => ({
      current,
      view,
      startExercise: (id: ExerciseId) => {
        setCurrent(id);
        setView("exercise");
      },
      openMenu: () => setView("menu"),
      setExercise: (id: ExerciseId) => setCurrent(id), // kept for compatibility if needed
    }),
    [current, view]
  );
}
