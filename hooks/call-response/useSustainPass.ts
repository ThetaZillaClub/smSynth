// hooks/call-response/useSustainPass.ts
"use client";
import { useEffect, useRef, useState } from "react";

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

  // Refs for fast-changing inputs (avoid effect restarts)
  const targetHzRef = useRef<number | null>(targetHz);
  const liveHzRef = useRef<number | null>(liveHz);
  const confRef = useRef<number>(confidence);
  targetHzRef.current = targetHz;
  liveHzRef.current = liveHz;
  confRef.current = confidence;

  // Refs to avoid stale closures inside RAF
  const heldRef = useRef(0);
  const passedRef = useRef(false);

  const startRef = useRef<number | null>(null);
  const lastTsRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);

  const reset = () => {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    setHeld(0);
    setPassed(false);
    setFailed(false);
    setLastCents(null);
    heldRef.current = 0;
    passedRef.current = false;
    startRef.current = null;
    lastTsRef.current = null;
  };

  useEffect(() => {
    if (!active) {
      reset();
      return;
    }

    const tick = () => {
      const now = performance.now();
      if (startRef.current == null) startRef.current = now;
      const lastTs = lastTsRef.current ?? now;
      const dt = (now - lastTs) / 1000;
      lastTsRef.current = now;

      const tHz = targetHzRef.current;
      const lHz = liveHzRef.current;
      const conf = confRef.current;

      const ok =
        tHz != null &&
        lHz != null &&
        conf >= confMin &&
        isFinite(lHz) &&
        isFinite(tHz);

      if (ok) {
        const cents = 1200 * Math.log2(lHz! / tHz!);
        setLastCents(Math.round(cents));
        const within = Math.abs(cents) <= centsTol;

        const nextHeld = Math.max(0, within ? heldRef.current + dt : 0);
        heldRef.current = nextHeld;
        setHeld(nextHeld);
      } else {
        setLastCents(null);
        heldRef.current = 0;
        setHeld(0);
      }

      const elapsed = (now - (startRef.current ?? now)) / 1000;
      if (!passedRef.current && heldRef.current >= holdSec) {
        passedRef.current = true;
        setPassed(true);
      } else if (!passedRef.current && elapsed >= retryAfterSec) {
        setFailed(true);
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
    // Only restart the RAF when these truly change:
  }, [active, confMin, centsTol, holdSec, retryAfterSec]);

  return { heldSec: held, passed, failed, lastCents, reset };
}
