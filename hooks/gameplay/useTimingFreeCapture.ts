// hooks/gameplay/useTimingFreeCapture.ts
import { useEffect, useMemo, useRef, useState } from "react";
import type { Phrase } from "@/utils/stage";

// Keep local so we don't import from other hooks
export type LoopPhase = "idle" | "call" | "lead-in" | "record" | "rest";

export default function useTimingFreeCapture(opts: {
  enabled: boolean;
  loopPhase: LoopPhase;
  liveHz: number | null;
  confidence: number | null;
  minCaptureSec: number;          // per-note capture (e.g., 1s)
  perNoteMaxSec?: number;         // hard budget per note (e.g., 5s)
  threshold?: number;             // confidence requirement
  phrase: Phrase | null;          // to derive expected notes
  tonicPc: number | null;         // for target rel calc
  endRecordEarly: () => void;     // called after the LAST note is captured or budget exhausted
}): { centerProgress01: number; targetRel: number | null; targetMidi: number | null } {
  const {
    enabled,
    loopPhase,
    liveHz,
    confidence,
    minCaptureSec,
    perNoteMaxSec = 10,
    threshold = 0.5,
    phrase,
    tonicPc,
    endRecordEarly,
  } = opts;

  // Derive relative semitone targets (one per expected note, keep order).
  const targetsRel: number[] = useMemo(() => {
    const tpc = (((tonicPc ?? 0) % 12) + 12) % 12;
    const ns = phrase?.notes ?? [];
    if (!ns.length) return [0];
    return ns.map((n) => {
      const m = Math.round(n.midi);
      const pcAbs = ((m % 12) + 12) % 12;
      return ((pcAbs - tpc) + 12) % 12;
    });
  }, [phrase, tonicPc]);

  const noteIndexRef = useRef(0);
  const noteStartedAtMsRef = useRef<number | null>(null);
  const streakStartMsRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);

  const [centerProgress01, setCenterProgress01] = useState<number>(0);
  const [targetRel, setTargetRel] = useState<number | null>(null);
  const [targetMidi, setTargetMidi] = useState<number | null>(null);

  // Reset index when phrase/targets change or we enter RECORD
  useEffect(() => {
    if (!enabled || loopPhase !== "record" || targetsRel.length === 0) return;
    noteIndexRef.current = 0;
    noteStartedAtMsRef.current = performance.now();
    streakStartMsRef.current = null;
    setCenterProgress01(0);
    setTargetRel(targetsRel[0] ?? null);
    const m0 = phrase?.notes?.[0]?.midi;
    setTargetMidi(typeof m0 === "number" ? Math.round(m0) : null);
  }, [enabled, loopPhase, targetsRel, phrase?.notes]);

  // Clear on leave/disable
  useEffect(() => {
    if (!enabled || loopPhase !== "record") {
      setCenterProgress01(0);
      setTargetRel(null);
      setTargetMidi(null);
      noteStartedAtMsRef.current = null;
      streakStartMsRef.current = null;
    }
  }, [enabled, loopPhase]);

  // Helper: advance to next expected note; finish when out
  const advanceNote = () => {
    noteIndexRef.current += 1;
    streakStartMsRef.current = null;
    noteStartedAtMsRef.current = performance.now();
    const idx = noteIndexRef.current;
    if (idx >= targetsRel.length) {
      try { endRecordEarly(); } catch {}
      return;
    }
    setCenterProgress01(0);
    setTargetRel(targetsRel[idx] ?? null);
    const m = phrase?.notes?.[idx]?.midi;
    setTargetMidi(typeof m === "number" ? Math.round(m) : null);
  };

  // 1) Early-advance controller (per-note) based on confidence streak OR time budget
  useEffect(() => {
    if (!enabled || loopPhase !== "record") {
      streakStartMsRef.current = null;
      return;
    }

    const now = performance.now();
    const noteStart = noteStartedAtMsRef.current ?? now;
    const elapsedNoteSec = (now - noteStart) / 1000;

    const isConfident =
      typeof liveHz === "number" &&
      liveHz > 0 &&
      typeof confidence === "number" &&
      confidence >= threshold;

    if (isConfident) {
      if (streakStartMsRef.current == null) {
        streakStartMsRef.current = now;
      } else if (minCaptureSec > 0) {
        const elapsed = (now - streakStartMsRef.current) / 1000;
        if (elapsed >= minCaptureSec) {
          // captured this note → move on
          advanceNote();
          return;
        }
      }
    } else {
      // Lose confidence → clear streak (but keep per-note timer alive)
      streakStartMsRef.current = null;
    }

    // Hard per-note budget → move on even if no confident streak
    if (elapsedNoteSec >= Math.max(minCaptureSec, perNoteMaxSec)) {
      advanceNote();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, loopPhase, liveHz, confidence, threshold, minCaptureSec, perNoteMaxSec, targetsRel.join(",")]);

  // 2) Progress ring animator — progress toward minCaptureSec for the CURRENT note
  useEffect(() => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (!enabled || loopPhase !== "record" || minCaptureSec <= 0) {
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

  return { centerProgress01, targetRel, targetMidi };
}
