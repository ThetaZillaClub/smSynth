// hooks/call-response/useSustainPass.ts
"use client";
import { useEffect, useRef, useState } from "react";
import { hzToMidi } from "@/utils/pitch/pitchMath";

export type SustainPassOptions = {
  active: boolean;
  targetHz: number | null;
  liveHz: number | null;
  confidence: number;
  confMin?: number;           // default 0.6
  centsTol?: number;          // default ±35¢
  holdSec?: number;           // default 0.375 (eighth at ~80bpm)
  retryAfterSec?: number;     // default 6s (auto re-prompt window)
};

export type SustainPassState = {
  heldSec: number;
  passed: boolean;
  failed: boolean;       // becomes true when retryAfterSec elapses without pass
  lastCents: number | null;
  reset: () => void;
};

export default function useSustainPass({
  active,
  targetHz,
  liveHz,
  confidence,
  confMin = 0.6,
  centsTol = 35,
  holdSec = 0.375,
  retryAfterSec = 6,
}: SustainPassOptions): SustainPassState {
  const [held, setHeld] = useState(0);
  const [passed, setPassed] = useState(false);
  const [failed, setFailed] = useState(false);
  const [lastCents, setLastCents] = useState<number | null>(null);

  const startRef = useRef<number | null>(null);
  const lastTsRef = useRef<number | null>(null);

  const reset = () => {
    setHeld(0);
    setPassed(false);
    setFailed(false);
    setLastCents(null);
    startRef.current = null;
    lastTsRef.current = null;
  };

  useEffect(() => {
    if (!active) { reset(); return; }
    const tick = () => {
      const now = performance.now();
      if (startRef.current == null) startRef.current = now;
      const lastTs = lastTsRef.current ?? now;
      const dt = (now - lastTs) / 1000;
      lastTsRef.current = now;

      const ok =
        targetHz != null &&
        liveHz != null &&
        confidence >= confMin &&
        isFinite(liveHz) &&
        isFinite(targetHz);

      if (ok) {
        const cents = 1200 * Math.log2(liveHz! / targetHz!);
        setLastCents(Math.round(cents));
        const within = Math.abs(cents) <= centsTol;
        setHeld((h) => Math.max(0, within ? h + dt : 0));
      } else {
        setLastCents(null);
        setHeld(0);
      }

      const elapsed = (now - (startRef.current ?? now)) / 1000;
      if (!passed && held + dt >= holdSec) {
        setPassed(true);
      } else if (!passed && elapsed >= retryAfterSec) {
        setFailed(true);
      }
      rafRef.current = requestAnimationFrame(tick);
    };

    const rafRef = { current: requestAnimationFrame(tick) as number | null };
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, targetHz, liveHz, confidence, confMin, centsTol, holdSec, retryAfterSec]);

  return { heldSec: held, passed, failed, lastCents, reset };
}
