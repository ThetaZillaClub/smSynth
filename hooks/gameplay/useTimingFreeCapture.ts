// hooks/gameplay/useTimingFreeCapture.ts
import { useEffect, useRef, useState } from "react";

// Keep local so we don't import from other hooks
export type LoopPhase = "idle" | "call" | "lead-in" | "record" | "rest";

export default function useTimingFreeCapture(opts: {
  enabled: boolean;
  loopPhase: LoopPhase;
  liveHz: number | null;
  confidence: number | null;
  minCaptureSec: number;
  threshold?: number;
  endRecordEarly: () => void;
}): { centerProgress01: number } {
  const {
    enabled,
    loopPhase,
    liveHz,
    confidence,
    minCaptureSec,
    threshold = 0.5,
    endRecordEarly,
  } = opts;

  const streakStartMsRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);

  const [centerProgress01, setCenterProgress01] = useState<number>(0);

  // ─────────────────────────────────────────────────────────────
  // 1) Early-end controller (NO UI state writes here; avoids loops)
  // ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!enabled || loopPhase !== "record") {
      // only clear the streak; let other effects reset UI state
      streakStartMsRef.current = null;
      return;
    }

    const isConfident =
      typeof liveHz === "number" &&
      liveHz > 0 &&
      typeof confidence === "number" &&
      confidence >= threshold;

    const now = performance.now();

    if (isConfident) {
      if (streakStartMsRef.current == null) {
        streakStartMsRef.current = now;
      } else if (minCaptureSec > 0) {
        const elapsed = (now - streakStartMsRef.current) / 1000;
        if (elapsed >= minCaptureSec) {
          streakStartMsRef.current = null; // guard double-fire
          try {
            endRecordEarly();
          } catch {}
        }
      }
    } else {
      // Lose confidence → just clear streak start
      streakStartMsRef.current = null;
    }
  }, [enabled, loopPhase, liveHz, confidence, threshold, minCaptureSec, endRecordEarly]);

  // ─────────────────────────────────────────────────────────────
  // 2) Progress ring animator (requestAnimationFrame)
  // ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }

    if (!enabled || loopPhase !== "record" || minCaptureSec <= 0) {
      // Reset once when we enter a disabled state; no loop
      setCenterProgress01(0);
      return;
    }

    const tick = () => {
      const start = streakStartMsRef.current;
      if (typeof start === "number") {
        const elapsed = (performance.now() - start) / 1000;
        const next = Math.max(0, Math.min(1, elapsed / minCaptureSec));
        setCenterProgress01((prev) => (prev !== next ? next : prev));
      } else {
        setCenterProgress01((prev) => (prev !== 0 ? 0 : prev));
      }
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [enabled, loopPhase, minCaptureSec]);

  // ─────────────────────────────────────────────────────────────
  // 3) Reset progress when leaving RECORD / disabling feature
  // ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!enabled || loopPhase !== "record") {
      setCenterProgress01(0);
    }
  }, [enabled, loopPhase]);

  return { centerProgress01 };
}
