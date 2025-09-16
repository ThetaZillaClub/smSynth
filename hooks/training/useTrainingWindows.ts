// hooks/training/useTrainingWindows.ts
"use client";

import { useMemo, useState } from "react";

type Opts = {
  searchParams: URLSearchParams;
  defaultOn?: number;
  defaultOff?: number;
  min?: number;  // lower bound for both windows
  max?: number;  // upper bound for both windows
};

/**
 * Parses ?on=&off= from the current URL once and exposes local state you can tweak in-UI.
 * Keeps page.tsx free of parsing logic while remaining testable.
 */
export default function useTrainingWindows({
  searchParams,
  defaultOn = 8,
  defaultOff = 8,
  min = 1,
  max = 120,
}: Opts) {
  const initial = useMemo(() => {
    const parsePos = (v: string | null) => {
      const n = v ? Number(v) : NaN;
      return Number.isFinite(n) && n > 0 ? n : null;
    };
    const clamp = (v: number) => Math.min(max, Math.max(min, v));
    return {
      on: clamp(parsePos(searchParams.get("on")) ?? defaultOn),
      off: clamp(parsePos(searchParams.get("off")) ?? defaultOff),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // parse only once on mount to avoid URL-driven re-renders

  const [windowOnSec, setWindowOnSec] = useState<number>(initial.on);
  const [windowOffSec, setWindowOffSec] = useState<number>(initial.off);

  return { windowOnSec, windowOffSec, setWindowOnSec, setWindowOffSec };
}
