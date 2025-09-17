// components/game-layout/lyrics/useActiveLyricIndex.ts
"use client";

import { useEffect, useState } from "react";
import type { LoopPhase } from "@/hooks/gameplay/usePracticeLoop";

type Opts = {
  step: "low" | "high" | "play";
  loopPhase: LoopPhase;
};

type ReturnShape = {
  activeIndex: number;
  setActiveIndex: (i: number) => void;
};

export default function useActiveLyricIndex({ step, loopPhase }: Opts): ReturnShape {
  const [activeIndex, setActiveIndex] = useState<number>(-1);

  useEffect(() => {
    const recording = step === "play" && loopPhase === "record";
    if (!recording) setActiveIndex(-1);
  }, [step, loopPhase]);

  return { activeIndex, setActiveIndex };
}
