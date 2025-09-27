"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import useSustainPass from "@/hooks/call-response/useSustainPass";
import type { TakeScore } from "@/utils/scoring/score";
import { buildSustainScore } from "./usePitchTuneScoring";

export function usePitchTuneRound({
  engaged,
  quarterSec,
  leadInSec,
  requiredHoldSec,
  // audio
  playMidiList,
  stopPlayback,
  // target selection
  pickRandomTarget,
  targetMidi,
  setTargetMidi,
  // mic state
  targetHz,
  liveHz,
  confidence,
}: {
  engaged: boolean;
  quarterSec: number;
  leadInSec: number;
  requiredHoldSec: number;
  playMidiList: (midi: number[], noteDurSec: number) => Promise<void> | void;
  stopPlayback: () => void;
  pickRandomTarget: () => number | null;
  targetMidi: number | null;
  setTargetMidi: (m: number | null) => void;
  targetHz: number | null;
  liveHz: number | null;
  confidence: number;
}) {
  const [running, setRunning] = useState(false);
  const [anchorMs, setAnchorMs] = useState<number | null>(null);
  const [round, setRound] = useState(1);

  // Review state
  const [showReview, setShowReview] = useState(false);
  const [lastScore, setLastScore] = useState<TakeScore | undefined>(undefined);
  const [sessionScores, setSessionScores] = useState<TakeScore[]>([]);
  const [canProceed, setCanProceed] = useState(false);

  const timers = useRef<number[]>([]);
  const clearTimers = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  };

  // Sustain gate
  const gate = useSustainPass({
    active: engaged && running && targetHz != null,
    targetHz,
    liveHz,
    confidence,
    confMin: 0.6,
    centsTol: 45,
    holdSec: requiredHoldSec,
    retryAfterSec: 7,
  });

  // Round scheduler: visual lead-in (no ticks) → play target → open gate
  const scheduleRound = useCallback(
    (m: number) => {
      const anchor = performance.now() + 120;
      setAnchorMs(anchor);

      const t1 = window.setTimeout(async () => {
        await playMidiList([m], Math.min(quarterSec, requiredHoldSec));
        setRunning(true);
      }, Math.max(0, leadInSec * 1000));
      timers.current.push(t1);
    },
    [leadInSec, playMidiList, quarterSec, requiredHoldSec]
  );

  // End-of-round handling → review
  useEffect(() => {
    if (!engaged || !running) return;

    if (gate.passed || gate.failed) {
      setRunning(false);
      stopPlayback();

      const score = buildSustainScore({
        heldSec: Math.min(gate.heldSec, requiredHoldSec),
        requiredHoldSec,
        lastCents: gate.lastCents,
        passed: gate.passed,
      });

      setLastScore(score);
      setSessionScores((s) => [...s, score]);
      setCanProceed(gate.passed);
      setShowReview(true);
    }
  }, [engaged, running, gate.passed, gate.failed, gate.heldSec, gate.lastCents, requiredHoldSec, stopPlayback]);

  // Public controls
  const start = useCallback(() => {
    const t = pickRandomTarget();
    if (t != null) {
      setTargetMidi(t);
      setShowReview(false);
      gate.reset();
      scheduleRound(t);
    }
  }, [pickRandomTarget, setTargetMidi, gate, scheduleRound]);

  const disengage = useCallback(() => {
    clearTimers();
    stopPlayback();
    setRunning(false);
    setShowReview(false);
  }, [stopPlayback]);

  const nextRound = useCallback(() => {
    if (!canProceed) return;
    setRound((n) => n + 1);
    start();
  }, [canProceed, start]);

  const retry = useCallback(() => {
    if (targetMidi == null) return;
    setShowReview(false);
    gate.reset();
    scheduleRound(targetMidi);
  }, [targetMidi, scheduleRound, gate]);

  useEffect(() => () => disengage(), [disengage]);

  return {
    running,
    anchorMs,
    round,
    // review
    showReview,
    lastScore,
    sessionScores,
    canProceed,
    // gate + requirement for UI
    gate,
    requiredHoldSec,
    // controls
    start,
    disengage,
    nextRound,
    retry,
  };
}

export default usePitchTuneRound;
