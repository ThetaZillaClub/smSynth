// components/training/pretest/guided-arpeggio/hooks/useGuidedArpMatcher.ts
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { hzToMidi } from "@/utils/pitch/pitchMath";

/**
 * Unguided arpeggio matcher (1–3–5–3–1), lenient only by cents:
 * - Uses inner/outer cents zones. Inner = full speed; Outer = reduced speed.
 * - Confidence is only gated with a floor of 0.5 (no other confidence changes).
 * - Hold time is whatever the caller passes (no easing).
 */
export default function useGuidedArpMatcher(opts: {
  active: boolean;
  tonicMidi: number;
  thirdSemitones: number;
  fifthSemitones: number;
  liveHz: number | null;
  confidence: number;
  confMin: number;       // respected, but never below 0.5
  centsTol: number;      // inner tolerance
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

  // Sequence
  const targetDegrees = useMemo(() => [1, 3, 5, 3, 1] as const, []);
  const targetOffsets = useMemo(
    () => [0, thirdSemitones, fifthSemitones, thirdSemitones, 0],
    [thirdSemitones, fifthSemitones]
  );

  // Cents-only leniency
  const innerTol = Math.max(0, centsTol);                 // unchanged from caller
  const outerTol = Math.min(120, innerTol + 50);          // allow near-misses up to ~±1 semitone
  const effConfMin = Math.max(0.5, confMin);              // confidence floor only

  const requiredMs = Math.max(10, holdSecPerNote * 1000); // unchanged

  const [captured, setCaptured] = useState<number[]>([]);
  const [passed, setPassed] = useState(false);

  const holdMsRef = useRef(0);
  const lastFrameTsRef = useRef<number | null>(null);
  const latchedDegRef = useRef<1 | 3 | 5 | null>(null);

  const toNearestDegree = useCallback(
    (midiFloat: number): { deg: 1 | 3 | 5; cents: number } | null => {
      let best: { deg: 1 | 3 | 5; cents: number } | null = null;
      for (let i = 0; i < targetOffsets.length; i++) {
        const off = targetOffsets[i];
        const base = tonicMidi + off;
        const oct = Math.round((midiFloat - base) / 12);
        const nearest = base + 12 * oct;
        const cents = (midiFloat - nearest) * 100;
        const abs = Math.abs(cents);
        if (abs <= outerTol) {
          const deg = (off === 0 ? 1 : off === thirdSemitones ? 3 : 5) as 1 | 3 | 5;
          if (!best || Math.abs(cents) < Math.abs(best.cents)) best = { deg, cents };
        }
      }
      return best;
    },
    [targetOffsets, tonicMidi, thirdSemitones, outerTol]
  );

  // Main matcher tick
  useEffect(() => {
    if (!active) {
      lastFrameTsRef.current = null;
      holdMsRef.current = 0;
      latchedDegRef.current = null;
      return;
    }

    const now = performance.now();
    const last = lastFrameTsRef.current ?? now;
    const dt = Math.max(0, now - last);
    lastFrameTsRef.current = now;

    const midi = typeof liveHz === "number" && liveHz > 0 ? hzToMidi(liveHz) : NaN;
    const near =
      confidence >= effConfMin && Number.isFinite(midi) ? toNearestDegree(midi as number) : null;

    const idx = captured.length;
    const expected = targetDegrees[idx];

    let hold = holdMsRef.current;

    if (near) {
      const absC = Math.abs(near.cents);
      const inInner = absC <= innerTol;
      const onExpected = near.deg === expected;

      // Update latch
      if (latchedDegRef.current !== near.deg) {
        latchedDegRef.current = near.deg;
        // keep current progress if switching between zones/degrees; do not hard reset
      }

      if (onExpected) {
        // progress based purely on cents zone
        const gain = inInner ? 1.0 : 0.6; // slower when only within outer
        hold += dt * gain;
      } else {
        // gently decay when close to the wrong degree (still cents-based)
        const decay = inInner ? 0.35 : 0.55;
        hold = Math.max(0, hold - dt * decay);
      }
    } else {
      // far away or low confidence: stronger decay
      hold = Math.max(0, hold - dt * 0.9);
      latchedDegRef.current = null;
    }

    // Clamp & store
    hold = Math.min(hold, requiredMs);
    holdMsRef.current = hold;

    // Capture expected degree
    if (hold >= requiredMs && latchedDegRef.current === expected) {
      const next = [...captured, expected];
      setCaptured(next);
      holdMsRef.current = 0;
      latchedDegRef.current = null;
      if (next.length === targetDegrees.length) setPassed(true);
    }
  }, [active, liveHz, confidence, effConfMin, innerTol, outerTol, requiredMs, toNearestDegree, captured, targetDegrees]);

  // Reset state when deactivating
  useEffect(() => {
    if (!active) {
      setCaptured((prev) => (prev.length ? [] : prev));
      setPassed((prev) => (prev ? false : prev));
    }
  }, [active]);

  return {
    capturedDegrees: captured,
    passed,
  };
}
