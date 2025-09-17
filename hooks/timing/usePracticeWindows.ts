// hooks/timing/usePracticeWindows.ts
"use client";

import { useState } from "react";

type Opts = {
  defaultOn?: number;   // not used by TrainingGame when musical mode is active, but kept for API parity
  defaultOff?: number;  // rest window (seconds)
  min?: number;
  max?: number;
};

/**
 * Local, SPA-friendly practice windows (no URL parsing).
 * You can later wire these to UI knobs or instructor presets.
 */
export default function usePracticeWindows({
  defaultOn = 8,
  defaultOff = 8,
  min = 1,
  max = 120,
}: Opts) {
  const clamp = (v: number) => Math.min(max, Math.max(min, v));

  // Keep API parity with previous hook, even if windowOnSec is unused by TrainingGame.
  const [windowOnSec, setWindowOnSec] = useState<number>(clamp(defaultOn));
  const [windowOffSec, setWindowOffSec] = useState<number>(clamp(defaultOff));

  return { windowOnSec, windowOffSec, setWindowOnSec, setWindowOffSec };
}
