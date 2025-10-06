// hooks/gameplay/useSpeedSetting.ts
'use client';

import * as React from 'react';

const KEY = 'gameplay:speedPercent';
const DEFAULT_PERCENT = 75; // Beginner

export function useSpeedSetting() {
  const [percent, setPercentState] = React.useState<number>(DEFAULT_PERCENT);

  // hydrate
  React.useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      const n = raw == null ? NaN : Number(raw);
      if (Number.isFinite(n) && n >= 75 && n <= 150) {
        setPercentState(Math.round(n));
      }
    } catch {}
  }, []);

  // persist
  const setPercent = React.useCallback((n: number) => {
    const clamped = Math.max(75, Math.min(150, Math.round(n)));
    setPercentState(clamped);
    try {
      localStorage.setItem(KEY, String(clamped));
    } catch {}
  }, []);

  const labelAtEdge = React.useMemo(() => {
    if (percent === 75) return 'Beginner';
    if (percent === 150) return 'Pro';
    return null;
  }, [percent]);

  return { percent, setPercent, labelAtEdge };
}
