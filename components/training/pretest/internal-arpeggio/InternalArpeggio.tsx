// components/training/pretest/internal-arpeggio/InternalArpeggio.tsx
"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import usePitchTuneDurations from "@/components/games/pitch-tune/hooks/usePitchTuneDurations";
import useSustainPass from "@/hooks/call-response/useSustainPass";
import { hzToMidi, midiToHz, midiToNoteName } from "@/utils/pitch/pitchMath";
import useGuidedArpMatcher from "@/components/training/pretest/guided-arpeggio/hooks/useGuidedArpMatcher";
import PlayProgressButton from "@/components/training/pretest/PlayProgressButton";
import type { ScaleName } from "@/utils/phrase/scales";

function triadOffsetsForScale(name?: ScaleName) {
  const minorish = new Set<ScaleName>(
    [
      "natural_minor",
      "harmonic_minor",
      "melodic_minor",
      "dorian",
      "phrygian",
      "minor_pentatonic",
    ] as unknown as ScaleName[]
  );
  const dim5 = new Set<ScaleName>(["locrian"] as unknown as ScaleName[]);
  const third = name && minorish.has(name) ? 3 : 4;
  const fifth = name && dim5.has(name) ? 6 : 7;
  return { third, fifth };
}

export default function InternalArpeggio({
  running,
  inResponse,
  onStart,
  onContinue,
  bpm,
  tsNum,
  tonicPc,
  lowHz,
  scaleName = "major",
  liveHz,
  confidence,
  playMidiList, // A440 cue
}: {
  statusText: string; // kept for external prop compatibility (not destructured)
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
  const { quarterSec, requiredHoldSec } = usePitchTuneDurations({ bpm, tsNum });
  const { third, fifth } = triadOffsetsForScale(scaleName);

  // ---- Tonic selection (low tonic from range) ----
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

  // ---- Solfège mapping (mode-tonic) ----
  const labelForDegree = useCallback(
    (deg: 1 | 3 | 5): string => {
      switch (scaleName) {
        case "lydian":
          return deg === 1 ? "fa" : deg === 3 ? "la" : "do";
        case "mixolydian":
          return deg === 1 ? "sol" : deg === 3 ? "ti" : "re";
        case "dorian":
          return deg === 1 ? "re" : deg === 3 ? "fa" : "la";
        case "phrygian":
          return deg === 1 ? "mi" : deg === 3 ? "sol" : "ti";
        case "locrian":
          return deg === 1 ? "ti" : deg === 3 ? "re" : "fa";
        case "natural_minor":
        case "harmonic_minor":
        case "melodic_minor":
        case "minor_pentatonic":
          return deg === 1 ? "la" : deg === 3 ? "do" : "mi";
        default:
          return deg === 1 ? "do" : deg === 3 ? "mi" : "sol";
      }
    },
    [scaleName]
  );

  const targetDegrees = useMemo(() => [1, 3, 5, 3, 1] as const, []);
  const patternLabel = useMemo(
    () => targetDegrees.map(labelForDegree).join("–"),
    [targetDegrees, labelForDegree]
  );

  // ---- Phase control ----
  const [phase, setPhase] = useState<"tonic" | "arp">("tonic");
  useEffect(() => {
    if (!running || !inResponse) setPhase("tonic");
  }, [running, inResponse]);
  const showTonicPhase = phase === "tonic";

  // ---- Step 1: sustain tonic (after A440) ----
  const gate = useSustainPass({
    active: running && inResponse && showTonicPhase && tonicHz != null,
    targetHz: tonicHz,
    liveHz,
    confidence,
    confMin: 0.6,
    centsTol: 60,
    holdSec: requiredHoldSec,
    retryAfterSec: 6,
  });

  // Latch & progress for step 1
  const tonicCompleteRef = useRef(false);
  useEffect(() => {
    if (showTonicPhase && gate.passed) tonicCompleteRef.current = true;
    if (!running) tonicCompleteRef.current = false;
  }, [showTonicPhase, gate.passed, running]);

  const tonicPctRaw = Math.max(
    0,
    Math.min(1, requiredHoldSec ? Math.min(gate.heldSec, requiredHoldSec) / requiredHoldSec : 0)
  );
  const tonicProgress = tonicCompleteRef.current ? 1 : tonicPctRaw;

  // ---- Delay before moving to step 2 (prevents snap change after tonic) ----
  const toArpDelayMs = useMemo(
    () => Math.min(1000, Math.max(450, Math.round(quarterSec * 1000))),
    [quarterSec]
  );
  const toArpTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (showTonicPhase && running && inResponse && gate.passed) {
      if (toArpTimerRef.current == null) {
        toArpTimerRef.current = window.setTimeout(() => {
          if (running && inResponse && showTonicPhase) {
            setPhase("arp");
          }
          toArpTimerRef.current = null;
        }, toArpDelayMs);
      }
    } else {
      if (toArpTimerRef.current != null) {
        window.clearTimeout(toArpTimerRef.current);
        toArpTimerRef.current = null;
      }
    }
    return () => {
      if (toArpTimerRef.current != null) {
        window.clearTimeout(toArpTimerRef.current);
        toArpTimerRef.current = null;
      }
    };
  }, [showTonicPhase, running, inResponse, gate.passed, toArpDelayMs]);

  // ---- Step 2: unguided matcher (1–3–5–3–1) ----
  const matcher = useGuidedArpMatcher({
    active: running && inResponse && !showTonicPhase && tonicMidi != null,
    tonicMidi: tonicMidi ?? 60,
    thirdSemitones: third,
    fifthSemitones: fifth,
    liveHz,
    confidence,
    confMin: 0.6,
    centsTol: 60,
    holdSecPerNote: 0.25,
  });

  const arpCompleteRef = useRef(false);
  useEffect(() => {
    if (!showTonicPhase && matcher.passed) arpCompleteRef.current = true;
    if (!running) arpCompleteRef.current = false;
  }, [showTonicPhase, matcher.passed, running]);

  const arpCount = matcher.capturedDegrees.length;
  const arpPctRaw = Math.max(0, Math.min(1, arpCount / 5));
  const arpProgress = arpCompleteRef.current ? 1 : arpPctRaw;

  // ---- Auto-advance ~800ms after success (one-shot) ----
  const advancedRef = useRef(false);
  useEffect(() => {
    if (!running) advancedRef.current = false;
  }, [running]);

  useEffect(() => {
    if (!showTonicPhase && matcher.passed && !advancedRef.current) {
      advancedRef.current = true;
      const id = window.setTimeout(onContinue, 800);
      return () => clearTimeout(id);
    }
  }, [showTonicPhase, matcher.passed, onContinue]);

  // ---- Button label per phase ----
  const currentIdx = Math.min(arpCount, targetDegrees.length - 1);
  const currentSolfege = labelForDegree(targetDegrees[currentIdx]);
  const buttonLabel = showTonicPhase ? "A4" : currentSolfege;

  // ---- Button behavior ----
  const onButtonClick = async () => {
    if (!running) {
      onStart();
      try {
        await playMidiList([69], Math.min(quarterSec, requiredHoldSec)); // A4 cue
      } catch {}
      return;
    }
    if (showTonicPhase) {
      try {
        await playMidiList([69], Math.min(quarterSec, requiredHoldSec)); // replay cue
      } catch {}
    }
    // No playback in step 2 (internal)
  };

  // ---- Helper copy ----
  const help = useMemo(() => {
    if (showTonicPhase) {
      if (!running) return "Press Play to hear A440. Then derive the tonic and hold it.";
      if (!inResponse) return "Listen… A440 will play first.";
      if (gate.passed) return "Great! You found and held the tonic.";
      if (gate.failed) return "Close. Re-center on the tonic and hold steady.";
      return "Sing the tonic you’ve derived from A440 and hold it…";
    }
    if (matcher.passed) return "Nice! You sang the arpeggio in order.";
    return "Sing the five notes in order — any tempo or octave.";
  }, [showTonicPhase, running, inResponse, gate.passed, gate.failed, matcher.passed]);

  return (
    <div className="rounded-xl bg-[#f2f2f2] border border-[#dcdcdc] p-3 shadow-sm">
      <div className="text-[11px] uppercase tracking-wide text-[#6b6b6b]">
        {showTonicPhase
          ? "Internal Arpeggio — Step 1: Tonic (A440 cue)"
          : `Internal Arpeggio — Step 2: ${patternLabel}`}
      </div>
      <p className="mt-1 text-xs text-[#373737]">{help}</p>
      {!showTonicPhase && (
        <div className="mt-0.5 text-[11px] text-[#6b6b6b]">
          Tonic {tonicLabel} • Pattern: {patternLabel} • We check order only; each ~0.25s.
        </div>
      )}

      <div className="mt-3 flex justify-center">
        <PlayProgressButton
          label={buttonLabel}
          ariaLabel={showTonicPhase ? "Cue A4" : `Sing: ${currentSolfege}`}
          tooltip={showTonicPhase ? "Play cue (A4)" : `Next: ${currentSolfege}`}
          onToggle={onButtonClick}
          progress={showTonicPhase ? tonicProgress : arpProgress}
          complete={showTonicPhase ? tonicCompleteRef.current : arpCompleteRef.current}
          disabled={!showTonicPhase /* no playback in step 2 */}
          size={72}
        />
      </div>
      {/* chips removed */}
    </div>
  );
}
