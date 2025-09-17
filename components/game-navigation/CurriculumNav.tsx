// components/game-navigation/CurriculumNav.tsx
"use client";

import React from "react";
import type { ExerciseId } from "./hooks/useAppMode";

type Props = {
  current: ExerciseId;
  setExercise: (id: ExerciseId) => void;
};

const ITEMS: { id: ExerciseId; label: string; enabled: boolean }[] = [
  { id: "training-game", label: "Training", enabled: true },
  { id: "range-setup", label: "Range Setup", enabled: false },
  { id: "interval-beginner", label: "Intervals (Beginner)", enabled: false },
  { id: "interval-scales", label: "Interval Scales", enabled: false },
  { id: "interval-detection", label: "Interval Detection (Listening)", enabled: false },
  { id: "keysig-detection", label: "Key Signature Detection", enabled: false },
  { id: "scale-singing-key", label: "Scale Singing (Key)", enabled: false },
  { id: "scale-singing-syncopation", label: "Scale Singing (Syncopation)", enabled: false },
  { id: "advanced-syncopation", label: "Advanced Syncopation", enabled: false },
];

export default function CurriculumNav({ current, setExercise }: Props) {
  return (
    <div className="w-full rounded-lg border border-[#d2d2d2] bg-[#ebebeb] p-3">
      <div className="flex flex-wrap gap-2">
        {ITEMS.map((item) => {
          const isActive = current === item.id;
          const disabled = !item.enabled;
          return (
            <button
              key={item.id}
              type="button"
              disabled={disabled}
              onClick={() => !disabled && setExercise(item.id)}
              className={[
                "px-3 py-2 rounded-md text-sm transition",
                isActive
                  ? "bg-[#0f0f0f] text-[#f0f0f0]"
                  : "bg-white text-[#0f0f0f] border border-[#d2d2d2] hover:bg-white/80",
                disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer",
              ].join(" ")}
              title={disabled ? "Coming soon" : undefined}
            >
              {item.label}
              {disabled && <span className="ml-2 text-[10px] px-1 py-0.5 rounded bg-[#dcdcdc]">soon</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
