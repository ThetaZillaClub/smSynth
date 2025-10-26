// components/setup/range/useRangeSteps.ts
"use client";

import { useCallback, useMemo, useState } from "react";
import { hzToMidi, midiToNoteName } from "@/utils/pitch/pitchMath";

type Step = "low" | "high" | "play";

type Opts = {
  updateRange: (which: "low" | "high", label: string) => Promise<void> | void;
  a4Hz?: number;
};

type ReturnShape = {
  step: Step;
  setStep: (s: Step) => void;
  lowHz: number | null;
  highHz: number | null;
  canPlay: boolean;
  confirmLow: (hz: number) => void;
  confirmHigh: (hz: number) => void;
  /** NEW: clears low/high + sets step back to "low" */
  resetAll: () => void;
};

export default function useRangeSteps({ updateRange, a4Hz = 440 }: Opts): ReturnShape {
  const [step, setStep] = useState<Step>("low");
  const [lowHz, setLowHz] = useState<number | null>(null);
  const [highHz, setHighHz] = useState<number | null>(null);

  const canPlay = useMemo(() => lowHz != null && highHz != null, [lowHz, highHz]);

  const snapToEqualTempered = useCallback(
    (hz: number) => {
      const m = Math.round(hzToMidi(hz, a4Hz));
      const snappedHz = a4Hz * Math.pow(2, (m - 69) / 12);
      const { name, octave } = midiToNoteName(m, { useSharps: true, octaveAnchor: "C" });
      return { label: `${name}${octave}`, snappedHz };
    },
    [a4Hz]
  );

  const confirmLow = useCallback(
    (hz: number) => {
      const { label, snappedHz } = snapToEqualTempered(hz);
      setLowHz(snappedHz);
      void updateRange("low", label);
      setStep("high");
    },
    [snapToEqualTempered, updateRange]
  );

  const confirmHigh = useCallback(
    (hz: number) => {
      const { label, snappedHz } = snapToEqualTempered(hz);
      setHighHz(snappedHz);
      void updateRange("high", label);
      setStep("play");
    },
    [snapToEqualTempered, updateRange]
  );

  // NEW: full reset for a new run
  const resetAll = useCallback(() => {
    setLowHz(null);
    setHighHz(null);
    setStep("low");
  }, []);

  return { step, setStep, lowHz, highHz, canPlay, confirmLow, confirmHigh, resetAll };
}
