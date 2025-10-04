// components/training/pretest/guided-arpeggio/hooks/useGuidedArpMatcher.ts
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { hzToMidi } from "@/utils/pitch/pitchMath";

/**
 * Unguided arpeggio matcher:
 * - Looks for degrees [1,3,5,3,1] relative to tonic, any octave
 * - Requires each note to be held ~holdSecPerNote with conf >= confMin
 * - Accepts +/- centsTol from target degree pitch
 * - Returns progress, mismatch flag, and passed flag
 */
export default function useGuidedArpMatcher(opts: {
  active: boolean;
  tonicMidi: number;            // low tonic root midi (any reference octave)
  thirdSemitones: number;       // 3rd interval in semitones (4 for major, 3 for minor, etc.)
  fifthSemitones: number;       // 7 for perfect fifth (6 in locrian)
  liveHz: number | null;
  confidence: number;
  confMin: number;              // e.g., 0.6
  centsTol: number;             // e.g., 60
  holdSecPerNote: number;       // e.g., 0.25
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

  // Target sequence in "degree numbers" and in semitone offsets for matching
  const targetDegrees = [1, 3, 5, 3, 1] as const;
  const targetOffsets = useMemo(
    () => [0, thirdSemitones, fifthSemitones, thirdSemitones, 0],
    [thirdSemitones, fifthSemitones]
  );

  const [captured, setCaptured] = useState<number[]>([]);
  const [mismatch, setMismatch] = useState(false);
  const [passed, setPassed] = useState(false);

  // Internal holding state
  const holdMsRef = useRef(0);
  const lastFrameTsRef = useRef<number | null>(null);
  const latchedDegRef = useRef<number | null>(null); // 1,3,5 currently being held
  const rearmNeededRef = useRef(false);              // require leaving the region before recapturing

  // Utility: map live MIDI (float) to nearest degree {1,3,5} or null if outside tolerance
  const centsTolSemis = centsTol / 100;
  const toNearestDegree = (midiFloat: number): { deg: 1 | 3 | 5; cents: number } | null => {
    // For each target offset, find the nearest octave and compute cents error
    let best: { deg: 1 | 3 | 5; cents: number } | null = null;

    for (let i = 0; i < targetOffsets.length; i++) {
      const off = targetOffsets[i];
      // Anchor for degree in some nearest octave:
      const base = tonicMidi + off;
      const oct = Math.round((midiFloat - base) / 12);
      const nearest = base + 12 * oct;
      const diffSemis = midiFloat - nearest;
      const cents = diffSemis * 100;
      const deg = (off === 0 ? 1 : off === thirdSemitones ? 3 : 5) as 1 | 3 | 5;
      if (Math.abs(cents) <= centsTol) {
        if (!best || Math.abs(cents) < Math.abs(best.cents)) best = { deg, cents };
      }
    }
    return best;
  };

  // Frame loop driven by React renders (pitch updates ~50fps from upstream)
  useEffect(() => {
    // Reset state when not active
    if (!active) {
      setCaptured([]);
      setMismatch(false);
      setPassed(false);
      holdMsRef.current = 0;
      lastFrameTsRef.current = null;
      latchedDegRef.current = null;
      rearmNeededRef.current = false;
      return;
    }

    const now = performance.now();
    const last = lastFrameTsRef.current ?? now;
    const dt = Math.max(0, now - last);
    lastFrameTsRef.current = now;

    // Determine which degree (if any) we're currently near
    const midi = typeof liveHz === "number" && liveHz > 0 ? hzToMidi(liveHz) : NaN;
    const near =
      confidence >= confMin && Number.isFinite(midi)
        ? toNearestDegree(midi as number)
        : null;

    // If we require a rearm (must move away before counting a new step), wait until not near anything
    if (rearmNeededRef.current) {
      if (!near) {
        rearmNeededRef.current = false; // rearmed
        latchedDegRef.current = null;
        holdMsRef.current = 0;
      }
      return;
    }

    // If near a degree, continue/accumulate hold; else reset hold
    if (near) {
      const curr = latchedDegRef.current;
      if (curr == null || curr !== near.deg) {
        // New candidate degree
        latchedDegRef.current = near.deg;
        holdMsRef.current = 0;
      } else {
        holdMsRef.current += dt;
      }

      // If held long enough, attempt to append to sequence
      if (holdMsRef.current >= holdSecPerNote * 1000) {
        const nextIndex = captured.length;
        const expected = targetDegrees[nextIndex];
        const got = latchedDegRef.current as number;

        if (got === expected) {
          const next = [...captured, got];
          setCaptured(next);
          if (next.length === targetDegrees.length) {
            setPassed(true);
          }
        } else {
          // Mark mismatch and also write what was captured for UX
          const next = [...captured, got];
          setCaptured(next);
          setMismatch(true);
        }

        // Require rearm (move away) before accepting another step
        rearmNeededRef.current = true;
        holdMsRef.current = 0;
      }
    } else {
      // Not near any target – reset hold timer but keep progress
      latchedDegRef.current = null;
      holdMsRef.current = 0;
    }
  }, [
    active,
    liveHz,
    confidence,
    confMin,
    centsTol,
    centsTolSemis, // eslint guard (derived)
    holdSecPerNote,
    tonicMidi,
    thirdSemitones,
    fifthSemitones,
  ]);

  // Reset sequence if user restarts or leaves response state
  useEffect(() => {
    if (!active) {
      setCaptured([]);
      setMismatch(false);
      setPassed(false);
    }
  }, [active]);

  return {
    capturedDegrees: captured, // sequence of 1/3/5 values (may include an early mismatch)
    mismatch,
    passed,
  };
}
