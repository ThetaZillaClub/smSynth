// components/game-layout/range/useRangeSteps.ts
"use client";

import { useCallback, useMemo, useState } from "react";
import { hzToNoteName } from "@/utils/pitch/pitchMath";

type Step = "low" | "high" | "play";

type Opts = {
  /** Persist range label when low/high confirmed */
  updateRange: (which: "low" | "high", label: string) => Promise<void> | void;
  a4Hz?: number; // default 440
};

type ReturnShape = {
  step: Step;
  setStep: (s: Step) => void;
  lowHz: number | null;
  highHz: number | null;
  canPlay: boolean;
  confirmLow: (hz: number) => void;
  confirmHigh: (hz: number) => void;
};

export default function useRangeSteps({ updateRange, a4Hz = 440 }: Opts): ReturnShape {
  const [step, setStep] = useState<Step>("low");
  const [lowHz, setLowHz] = useState<number | null>(null);
  const [highHz, setHighHz] = useState<number | null>(null);

  const canPlay = useMemo(() => lowHz != null && highHz != null, [lowHz, highHz]);

  const confirmLow = useCallback(
    (hz: number) => {
      setLowHz(hz);
      const { name, octave } = hzToNoteName(hz, a4Hz, { useSharps: true, octaveAnchor: "A" });
      const label = `${name}${octave}`;
      void updateRange("low", label);
      setStep("high");
    },
    [a4Hz, updateRange]
  );

  const confirmHigh = useCallback(
    (hz: number) => {
      setHighHz(hz);
      const { name, octave } = hzToNoteName(hz, a4Hz, { useSharps: true, octaveAnchor: "A" });
      const label = `${name}${octave}`;
      void updateRange("high", label);
      setStep("play");
    },
    [a4Hz, updateRange]
  );

  return { step, setStep, lowHz, highHz, canPlay, confirmLow, confirmHigh };
}
