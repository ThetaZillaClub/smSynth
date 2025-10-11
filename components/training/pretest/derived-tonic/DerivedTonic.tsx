"use client";

import React, { useCallback, useEffect, useMemo, useRef } from "react";
import usePitchTuneDurations from "@/components/games/pitch-tune/hooks/usePitchTuneDurations";
import useSustainPass from "@/hooks/call-response/useSustainPass";
import { hzToMidi, midiToHz, midiToNoteName } from "@/utils/pitch/pitchMath";
import PlayProgressButton from "@/components/training/pretest/PlayProgressButton";

export default function DerivedTonic({
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

  // --- Cue is fixed A440 (A4) ---
  const cueMidi = 69; // A4
  const cueLabel = useMemo(() => {
    const n = midiToNoteName(cueMidi, { useSharps: true });
    return `${n.name}${n.octave}`; // "A4"
  }, []);

  // --- Target is the tonic (low tonic root from range) ---
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

  // Gate for passing (same tolerance = 60¢)
  const gate = useSustainPass({
    active: !!inResponse && running && tonicHz != null,
    targetHz: tonicHz,
    liveHz,
    confidence,
    confMin: 0.6,
    centsTol: 60,
    holdSec: requiredHoldSec,
    retryAfterSec: 6,
  });

  const held = Math.min(gate.heldSec, requiredHoldSec);
  const pctRaw = Math.max(0, Math.min(1, requiredHoldSec ? held / requiredHoldSec : 0));

  // Latch 100% once passed so the progress & glow stay on until reset
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

  // Auto-advance once the gate passes (with 1s delay)
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

  // Description/help text — mirrors SinglePitch style/placement
  const help = useMemo(() => {
    if (!running) return "Press Play to hear A440. Then derive the tonic and hold it.";
    if (!inResponse) return "Listen… A440 will play first.";
    if (gate.passed) return "Great! You found and held the tonic.";
    if (gate.failed) return "Close. Re-center on the tonic and hold steady.";
    return "Sing the tonic you’ve derived from A440 and hold it…";
  }, [running, inResponse, gate.passed, gate.failed]);

  // Button behavior:
  // - first click starts (handled upstream via onStart)
  // - subsequent clicks replay the teacher cue (A440)
  const onButtonClick = async () => {
    if (!running) {
      onStart();
      return;
    }
    try {
      await playMidiList([cueMidi], Math.min(quarterSec, requiredHoldSec));
    } catch {}
  };

  // Light-theme card + description + centered button (same styling as SinglePitch)
  return (
    <div className="rounded-xl bg-[#f2f2f2] border border-[#dcdcdc] p-3 shadow-sm">
      <div className="text-[11px] uppercase tracking-wide text-[#6b6b6b]">Derived Tonic</div>
      <p className="mt-1 text-xs text-[#373737]">{help}</p>

      <div className="mt-3 flex justify-center">
        <PlayProgressButton
          label={cueLabel}                         // show "A4" for the cue
          ariaLabel={`Cue ${cueLabel}`}           // accessible label
          tooltip={`Play cue (${cueLabel})`}
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
