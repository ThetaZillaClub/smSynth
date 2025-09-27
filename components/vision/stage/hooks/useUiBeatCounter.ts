// components/vision/stage/hooks/useUiBeatCounter.ts
"use client";

import { useEffect, useState } from "react";

type Phase = "idle" | "lead" | "run" | "done";

/**
 * Derived UI beat number based on anchor time and phase.
 */
export default function useUiBeatCounter(
  phase: Phase,
  anchorMs: number | null,
  secPerBeat: number,
  leadBeats: number,
  runBeats: number
) {
  const [uiBeat, setUiBeat] = useState(0);

  useEffect(() => {
    if (phase === "idle" || anchorMs == null) return;
    let raf: number | null = null;

    const tick = () => {
      const t = (performance.now() - anchorMs) / 1000;
      if (phase === "lead") {
        const b = Math.min(leadBeats, Math.max(1, Math.floor(t / secPerBeat) + 1));
        setUiBeat(b);
      } else if (phase === "run") {
        const b = Math.floor((t - leadBeats * secPerBeat) / secPerBeat) + 1;
        setUiBeat(Math.min(runBeats, Math.max(1, b)));
      }
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => {
      if (raf) cancelAnimationFrame(raf);
    };
  }, [phase, anchorMs, secPerBeat, leadBeats, runBeats]);

  // reset when idle
  useEffect(() => {
    if (phase === "idle") setUiBeat(0);
  }, [phase]);

  return uiBeat;
}
