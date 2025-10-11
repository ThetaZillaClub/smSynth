"use client";

import React, { useCallback, useEffect, useMemo, useRef } from "react";
import usePitchTuneDurations from "@/components/games/pitch-tune/hooks/usePitchTuneDurations";
import { hzToMidi, midiToHz, midiToNoteName } from "@/utils/pitch/pitchMath";
import PlayProgressButton from "@/components/training/pretest/PlayProgressButton";
import useSinglePitchGate from "@/components/training/pretest/single-pitch/hooks/useSinglePitchGate";

export default function SinglePitch({
  statusText, // kept for prop compatibility; not shown
  running,
  inResponse,
  onStart,
  onContinue,

  // musical context
  bpm,
  tsNum,
  tonicPc,
  lowHz,

  // audio/mic
  liveHz,
  confidence,
  playMidiList,
}: {
  statusText: string;
  running: boolean;
  inResponse: boolean;
  onStart: () => void;
  onContinue: () => void;

  bpm: number;
  tsNum: number;
  tonicPc: number;
  lowHz: number | null;

  liveHz: number | null;
  confidence: number;
  playMidiList: (midi: number[], noteDurSec: number) => Promise<void> | void;
}) {
  const { quarterSec, requiredHoldSec } = usePitchTuneDurations({ bpm, tsNum });

  // Pick the low tonic root from range
  const tonicMidi = useMemo<number | null>(() => {
    if (lowHz == null) return null;
    const lowM = Math.round(hzToMidi(lowHz));
    const wantPc = ((tonicPc % 12) + 12) % 12;
    for (let m = lowM; m < lowM + 36; m++) {
      if ((((m % 12) + 12) % 12) === wantPc) return m;
    }
    return null;
  }, [lowHz, tonicPc]);

  const tonicHz = useMemo(() => (tonicMidi != null ? midiToHz(tonicMidi, 440) : null), [tonicMidi]);
  const tonicLabel = useMemo(() => {
    if (tonicMidi == null) return "—";
    const n = midiToNoteName(tonicMidi, { useSharps: true });
    return `${n.name}${n.octave}`;
  }, [tonicMidi]);

  // Sustain gate using wrapper (internally stable)
  const gate = useSinglePitchGate({
    active: !!inResponse && running && tonicHz != null,
    targetHz: tonicHz,
    liveHz,
    confidence,
    holdSec: requiredHoldSec,
  });

  const held = Math.min(gate.heldSec, requiredHoldSec);
  const pctRaw = Math.max(0, Math.min(1, requiredHoldSec ? held / requiredHoldSec : 0));

  // Latch "complete" once passed so progress & glow stay at 100% until reset
  const completeLatch = useRef(false);
  useEffect(() => {
    if (gate.passed) completeLatch.current = true;
    if (!running) completeLatch.current = false; // reset when pretest stops
  }, [gate.passed, running]);

  const displayProgress = completeLatch.current ? 1 : pctRaw;

  // Delayed auto-advance (digest/rest)
  const advanceTimeoutRef = useRef<number | null>(null);
  const queueAdvance = useCallback(() => {
    if (advanceTimeoutRef.current) window.clearTimeout(advanceTimeoutRef.current);
    advanceTimeoutRef.current = window.setTimeout(() => onContinue(), 1000);
  }, [onContinue]);

  useEffect(
    () => () => {
      if (advanceTimeoutRef.current) window.clearTimeout(advanceTimeoutRef.current);
    },
    []
  );

  // Auto-advance when passed (with 1s delay)
  const passLatch = useRef(false);
  useEffect(() => {
    if (!running) passLatch.current = false;
  }, [running]);
  useEffect(() => {
    if (running && inResponse && gate.passed && !passLatch.current) {
      passLatch.current = true;
      queueAdvance();
    }
    if (!gate.passed) passLatch.current = false;
  }, [running, inResponse, gate.passed, queueAdvance]);

  // Description/help text
  const help = useMemo(() => {
    if (tonicMidi == null) return "Waiting for your saved range…";
    if (!running) return "Press Play to start. Then match and hold the target.";
    if (!inResponse) return "Listen… the target will play first.";
    if (gate.passed) return "Nice! You matched and held the tonic.";
    if (gate.failed) return "Almost. Try again to hold it steady.";
    return "Sing the target and hold steady…";
  }, [tonicMidi, running, inResponse, gate.passed, gate.failed]);

  const playTarget = async () => {
    if (tonicMidi == null) return;
    await playMidiList([tonicMidi], Math.min(quarterSec, requiredHoldSec));
  };

  const onButtonClick = async () => {
    if (!running) {
      onStart(); // first click starts the pretest
      return;
    }
    await playTarget();
  };

  // Light-theme card + description above centered button (matches SidePanelScores language)
  return (
    <div className="rounded-xl bg-[#f2f2f2] border border-[#dcdcdc] p-3 shadow-sm">
      <div className="text-[11px] uppercase tracking-wide text-[#6b6b6b]">Single Pitch — Tonic</div>
      <p className="mt-1 text-xs text-[#373737]">{help}</p>

      <div className="mt-3 flex justify-center">
        <PlayProgressButton
          label={tonicLabel}
          onToggle={onButtonClick}
          progress={displayProgress}
          complete={completeLatch.current}
          disabled={running && tonicMidi == null}
          size={72}
        />
      </div>
    </div>
  );
}
