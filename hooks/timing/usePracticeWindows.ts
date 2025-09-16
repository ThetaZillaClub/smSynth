// hooks/timing/usePracticeWindows.ts
"use client";

import { useMemo, useState } from "react";

type Opts = {
  searchParams: URLSearchParams;
  defaultOn?: number;
  defaultOff?: number;
  min?: number;
  max?: number;
};

/**
 * Parses ?on=&off= from the current URL once and exposes local state you can tweak in-UI.
 */
export default function usePracticeWindows({
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
  }, []); // parse only once

  const [windowOnSec, setWindowOnSec] = useState<number>(initial.on);
  const [windowOffSec, setWindowOffSec] = useState<number>(initial.off);

  return { windowOnSec, windowOffSec, setWindowOnSec, setWindowOffSec };
}
