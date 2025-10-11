// components/training/pretest/guided-arpeggio/GuidedArpeggio.tsx
"use client";

import React, { useEffect, useMemo, useRef } from "react";
import usePitchTuneDurations from "@/components/games/pitch-tune/hooks/usePitchTuneDurations";
import { hzToMidi, midiToNoteName } from "@/utils/pitch/pitchMath";
import useGuidedArpMatcher from "./hooks/useGuidedArpMatcher";
import PlayProgressButton from "@/components/training/pretest/PlayProgressButton";
import type { ScaleName } from "@/utils/phrase/scales";

export default function GuidedArpeggio({
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
  scaleName = "major",

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
  scaleName?: ScaleName;

  liveHz: number | null;
  confidence: number;
  playMidiList: (midi: number[], noteDurSec: number) => Promise<void> | void;
}) {
  const { quarterSec } = usePitchTuneDurations({ bpm, tsNum });

  // ----- Tonic (low tonic from range) -----
  const tonicMidi = useMemo<number | null>(() => {
    if (lowHz == null) return null;
    const lowM = Math.round(hzToMidi(lowHz));
    const wantPc = ((tonicPc % 12) + 12) % 12;
    for (let m = lowM; m < lowM + 36; m++) {
      if ((((m % 12) + 12) % 12) === wantPc) return m;
    }
    return null;
  }, [lowHz, tonicPc]);

  const tonicLabel = useMemo(() => {
    if (tonicMidi == null) return "—";
    const n = midiToNoteName(tonicMidi, { useSharps: true });
    return `${n.name}${n.octave}`;
  }, [tonicMidi]);

  // ----- Intervals by scale -----
  const isMinorish = useMemo(
    () =>
      scaleName === "natural_minor" ||
      scaleName === "harmonic_minor" ||
      scaleName === "melodic_minor" ||
      scaleName === "dorian" ||
      scaleName === "phrygian" ||
      scaleName === "minor_pentatonic",
    [scaleName]
  );

  const triadOffsets = useMemo(() => {
    if (scaleName === "locrian") return { third: 3, fifth: 6 }; // diminished 5
    if (isMinorish) return { third: 3, fifth: 7 };              // minor 3, P5
    return { third: 4, fifth: 7 };                               // major
  }, [scaleName, isMinorish]);

  const callMidis = useMemo<number[] | null>(() => {
    if (tonicMidi == null) return null;
    const r = tonicMidi;
    const { third, fifth } = triadOffsets;
    return [r, r + third, r + fifth, r + third, r];
  }, [tonicMidi, triadOffsets]);

  // ----- Solfège mapping -----
  const labelForDegree = (deg: 1 | 3 | 5): string => {
    if (scaleName === "locrian") return deg === 1 ? "ti" : deg === 3 ? "re" : "se";
    if (isMinorish) return deg === 1 ? "la" : deg === 3 ? "do" : "me";
    return deg === 1 ? "do" : deg === 3 ? "mi" : "sol";
  };
  const targetDegrees = [1, 3, 5, 3, 1] as const;
  const patternLabel = useMemo(
    () => targetDegrees.map(labelForDegree).join("–"),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scaleName]
  );

  // ----- Matcher (order-only; lenient by cents; confidence floor .5) -----
  const matcher = useGuidedArpMatcher({
    active: !!inResponse && running && tonicMidi != null,
    tonicMidi: tonicMidi ?? 60,
    thirdSemitones: triadOffsets.third,
    fifthSemitones: triadOffsets.fifth,
    liveHz,
    confidence,
    confMin: 0.5, // floor .5
    centsTol: 60,
    holdSecPerNote: 0.25,
  });

  // Latch 100% ring after pass
  const completeRef = useRef(false);
  useEffect(() => {
    if (matcher.passed) completeRef.current = true;
    if (!running) completeRef.current = false;
  }, [matcher.passed, running]);

  const progRaw = Math.max(0, Math.min(1, matcher.capturedDegrees.length / targetDegrees.length));
  const displayProgress = completeRef.current ? 1 : progRaw;

  // ----- Auto-advance ~800ms after pass (single pass only) -----
  const advancedRef = useRef(false);
  useEffect(() => {
    if (!running) advancedRef.current = false;
  }, [running]);

  useEffect(() => {
    if (running && inResponse && matcher.passed && !advancedRef.current) {
      advancedRef.current = true;
      const id = window.setTimeout(() => onContinue(), 800);
      return () => clearTimeout(id);
    }
  }, [running, inResponse, matcher.passed, onContinue]);

  // ----- Phase-aware button label (one at a time) -----
  const currentIdx = Math.min(matcher.capturedDegrees.length, targetDegrees.length - 1);
  const currentSolfege = labelForDegree(targetDegrees[currentIdx]);
  const buttonLabel = running && inResponse ? currentSolfege : "Play";

  const help = useMemo(() => {
    if (!running) return "Press Play to start. Then echo the arpeggio.";
    if (!inResponse) return `Listen… the teacher will sing ${patternLabel}.`;
    if (matcher.passed) return "Great! You sang the pattern in order.";
    return "Sing the five notes in order — any tempo or octave.";
  }, [running, inResponse, matcher.passed, patternLabel]);

  const onButtonClick = async () => {
    if (!running) {
      onStart(); // parent will schedule the call phase
      return;
    }
    if (!callMidis) return; // range not ready yet
    try {
      await playMidiList(callMidis, quarterSec);
    } catch {}
  };

  return (
    <div className="rounded-xl bg-[#f2f2f2] border border-[#dcdcdc] p-3 shadow-sm">
      <div className="text-[11px] uppercase tracking-wide text-[#6b6b6b]">Guided Arpeggio</div>
      <p className="mt-1 text-xs text-[#373737]">{help}</p>
      <div className="mt-0.5 text-[11px] text-[#6b6b6b]">
        Tonic {tonicLabel} • Pattern: {patternLabel} (order only; ~0.25s each)
      </div>

      <div className="mt-3 flex justify-center">
        <PlayProgressButton
          label={buttonLabel}
          ariaLabel={running && inResponse ? `Echo ${currentSolfege}` : "Start pre-test"}
          tooltip={running && inResponse ? `Next: ${currentSolfege}` : "Start pre-test"}
          onToggle={onButtonClick}
          progress={displayProgress}
          complete={completeRef.current}
          disabled={running && !callMidis /* allow starting even if range not loaded */}
          size={72}
        />
      </div>
      {/* chips removed */}
    </div>
  );
}
