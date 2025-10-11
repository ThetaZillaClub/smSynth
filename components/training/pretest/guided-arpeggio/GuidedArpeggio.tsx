"use client";

import React, { useCallback, useEffect, useMemo, useRef } from "react";
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

  // Low tonic reference
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

  // Intervals by scale
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
    if (scaleName === "locrian") return { third: 3, fifth: 6 };
    if (isMinorish) return { third: 3, fifth: 7 };
    return { third: 4, fifth: 7 };
  }, [scaleName, isMinorish]);

  const callMidis = useMemo<number[] | null>(() => {
    if (tonicMidi == null) return null;
    const r = tonicMidi;
    const { third, fifth } = triadOffsets;
    return [r, r + third, r + fifth, r + third, r];
  }, [tonicMidi, triadOffsets]);

  // Solfège caption
  const labelForDegree = (deg: 1 | 3 | 5): string => {
    if (scaleName === "locrian") return deg === 1 ? "ti" : deg === 3 ? "re" : "se";
    if (isMinorish) return deg === 1 ? "la" : deg === 3 ? "do" : "me";
    return deg === 1 ? "do" : deg === 3 ? "mi" : "sol";
  };
  const targetDegrees = [1, 3, 5, 3, 1] as const;
  const targetSolfeg = useMemo(() => targetDegrees.map(labelForDegree).join("–"), [isMinorish, scaleName]);

  // Matcher (order-only)
  const matcher = useGuidedArpMatcher({
    active: !!inResponse && running && tonicMidi != null,
    tonicMidi: tonicMidi ?? 60,
    thirdSemitones: triadOffsets.third,
    fifthSemitones: triadOffsets.fifth,
    liveHz,
    confidence,
    confMin: 0.6,
    centsTol: 60,
    holdSecPerNote: 0.25,
  });

  // Latch completion for ring glow
  const completeRef = useRef(false);
  useEffect(() => {
    if (matcher.passed) completeRef.current = true;
    if (!running) completeRef.current = false;
  }, [matcher.passed, running]);

  const progRaw = Math.max(0, Math.min(1, matcher.capturedDegrees.length / targetDegrees.length));
  const displayProgress = completeRef.current ? 1 : progRaw;

  // 🔁 Robust auto-advance: fire once when passed, regardless of inResponse
  const advanceTimerRef = useRef<number | null>(null);
  const passQueuedRef = useRef(false);

  useEffect(() => {
    if (!running) {
      passQueuedRef.current = false;
    }
  }, [running]);

  useEffect(() => {
    if (matcher.passed && !passQueuedRef.current) {
      passQueuedRef.current = true;
      if (advanceTimerRef.current) window.clearTimeout(advanceTimerRef.current);
      advanceTimerRef.current = window.setTimeout(() => onContinue(), 800);
    }
  }, [matcher.passed, onContinue]);

  useEffect(() => {
    return () => {
      if (advanceTimerRef.current) window.clearTimeout(advanceTimerRef.current);
    };
  }, []);

  const help = useMemo(() => {
    if (!running) return "Press Play to start. Then echo the arpeggio.";
    if (!inResponse) return `Listen… the teacher will sing ${targetSolfeg}.`;
    if (matcher.passed) return "Great! You sang the pattern in order.";
    return "Sing the five notes in order — any tempo or octave.";
  }, [running, inResponse, matcher.passed, targetSolfeg]);

  const onButtonClick = async () => {
    if (!running) {
      onStart();
      return;
    }
    if (!callMidis) return;
    try {
      await playMidiList(callMidis, quarterSec);
    } catch {}
  };

  return (
    <div className="rounded-xl bg-[#f2f2f2] border border-[#dcdcdc] p-3 shadow-sm">
      <div className="text-[11px] uppercase tracking-wide text-[#6b6b6b]">Guided Arpeggio</div>
      <p className="mt-1 text-xs text-[#373737]">{help}</p>
      <div className="mt-0.5 text-[11px] text-[#6b6b6b]">
        Tonic {tonicLabel} • Pattern: {targetSolfeg} (order only; ~0.25s each)
      </div>

      <div className="mt-3 flex justify-center">
        <PlayProgressButton
          label="1–3–5–3–1"
          ariaLabel="Play arpeggio 1–3–5–3–1"
          tooltip="Play arpeggio"
          onToggle={onButtonClick}
          progress={displayProgress}
          complete={completeRef.current}
          disabled={!callMidis}
          size={72}
        />
      </div>

      {/* Compact degree chips under the button */}
      <div className="mt-2 flex items-center justify-center gap-1">
        {targetDegrees.map((deg, i) => {
          const got = matcher.capturedDegrees[i] ?? null;
          const ok = got != null && got === deg;
          return (
            <span
              key={i}
              className={[
                "inline-flex items-center justify-center w-7 h-7 rounded-md border text-xs font-semibold",
                ok ? "bg-[#0f0f0f] text-white border-[#0f0f0f]" : "bg-white text-[#2d2d2d] border-[#dcdcdc]",
              ].join(" ")}
              title={ok ? "Matched" : "Waiting…"}
            >
              {deg}
            </span>
          );
        })}
      </div>
    </div>
  );
}
