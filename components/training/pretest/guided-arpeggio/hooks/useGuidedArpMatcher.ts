// components/training/pretest/guided-arpeggio/hooks/useGuidedArpMatcher.ts
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { hzToMidi } from "@/utils/pitch/pitchMath";

/**
 * Unguided arpeggio matcher (1–3–5–3–1):
 * - Waits for the correct next degree; ignores wrong notes (no "mismatch" state).
 * - Each step must be held for `holdSecPerNote` with conf >= `confMin` and within `centsTol`.
 */
export default function useGuidedArpMatcher(opts: {
  active: boolean;
  tonicMidi: number;
  thirdSemitones: number;
  fifthSemitones: number;
  liveHz: number | null;
  confidence: number;
  confMin: number;
  centsTol: number;
  holdSecPerNote: number;
}) {
  const {
    active,
    tonicMidi,
    thirdSemitones,
    fifthSemitones,
    liveHz,
    confidence,
    confMin,
    centsTol,
    holdSecPerNote,
  } = opts;

  const targetDegrees = [1, 3, 5, 3, 1] as const;
  const targetOffsets = useMemo(
    () => [0, thirdSemitones, fifthSemitones, thirdSemitones, 0],
    [thirdSemitones, fifthSemitones]
  );

  const [captured, setCaptured] = useState<number[]>([]);
  const [passed, setPassed] = useState(false);

  const holdMsRef = useRef(0);
  const lastFrameTsRef = useRef<number | null>(null);
  const latchedDegRef = useRef<1 | 3 | 5 | null>(null);

  const toNearestDegree = (midiFloat: number): { deg: 1 | 3 | 5; cents: number } | null => {
    let best: { deg: 1 | 3 | 5; cents: number } | null = null;
    for (let i = 0; i < targetOffsets.length; i++) {
      const off = targetOffsets[i];
      const base = tonicMidi + off;
      const oct = Math.round((midiFloat - base) / 12);
      const nearest = base + 12 * oct;
      const cents = (midiFloat - nearest) * 100;
      const deg = (off === 0 ? 1 : off === thirdSemitones ? 3 : 5) as 1 | 3 | 5;
      if (Math.abs(cents) <= centsTol) {
        if (!best || Math.abs(cents) < Math.abs(best.cents)) best = { deg, cents };
      }
    }
    return best;
  };

  useEffect(() => {
    if (!active) {
      setCaptured([]);
      setPassed(false);
      holdMsRef.current = 0;
      lastFrameTsRef.current = null;
      latchedDegRef.current = null;
      return;
    }

    const now = performance.now();
    const last = lastFrameTsRef.current ?? now;
    const dt = Math.max(0, now - last);
    lastFrameTsRef.current = now;

    const midi = typeof liveHz === "number" && liveHz > 0 ? hzToMidi(liveHz) : NaN;
    const near =
      confidence >= confMin && Number.isFinite(midi)
        ? toNearestDegree(midi as number)
        : null;

    const idx = captured.length;
    const expected = targetDegrees[idx];

    if (near) {
      // track/accumulate the currently-held degree
      if (latchedDegRef.current !== near.deg) {
        latchedDegRef.current = near.deg;
        holdMsRef.current = 0;
      } else {
        holdMsRef.current += dt;
      }

      // progress only when the expected degree is held long enough
      if (latchedDegRef.current === expected && holdMsRef.current >= holdSecPerNote * 1000) {
        const next = [...captured, expected];
        setCaptured(next);
        holdMsRef.current = 0;
        latchedDegRef.current = null;
        if (next.length === targetDegrees.length) setPassed(true);
      }

      // holding a wrong degree? do nothing (keep waiting); ensure full hold when corrected
      if (latchedDegRef.current && latchedDegRef.current !== expected) {
        if (holdMsRef.current >= holdSecPerNote * 1000) holdMsRef.current = 0;
      }
    } else {
      // away from targets resets the hold timer; progress persists
      latchedDegRef.current = null;
      holdMsRef.current = 0;
    }
  }, [
    active,
    liveHz,
    confidence,
    confMin,
    centsTol,
    holdSecPerNote,
    captured.length,
    tonicMidi,
    thirdSemitones,
    fifthSemitones,
  ]);

  useEffect(() => {
    if (!active) {
      setCaptured([]);
      setPassed(false);
    }
  }, [active]);

  return {
    capturedDegrees: captured,
    passed,
  };
}
