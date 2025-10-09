"use client";

import React, { useCallback, useEffect, useMemo, useRef } from "react";
import usePitchTuneDurations from "@/components/games/pitch-tune/hooks/usePitchTuneDurations";
import { hzToMidi, midiToNoteName } from "@/utils/pitch/pitchMath";
import useGuidedArpMatcher from "./hooks/useGuidedArpMatcher";
import type { ScaleName } from "@/utils/phrase/scales";

export default function GuidedArpeggio({
  statusText,
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
  const { quarterSec, leadInSec } = usePitchTuneDurations({ bpm, tsNum });

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

  // —— Intervals: choose 3rd/5th by scale —— //
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
    if (scaleName === "locrian") return { third: 3, fifth: 6 }; // diminished 5th
    if (isMinorish) return { third: 3, fifth: 7 }; // minor 3rd, perfect 5th
    return { third: 4, fifth: 7 }; // major
  }, [scaleName, isMinorish]);

  const callMidis = useMemo<number[] | null>(() => {
    if (tonicMidi == null) return null;
    const r = tonicMidi;
    const { third, fifth } = triadOffsets;
    return [r, r + third, r + fifth, r + third, r];
  }, [tonicMidi, triadOffsets]);

  // —— Solfège labels for the chip row —— //
  const labelForDegree = (deg: 1 | 3 | 5): string => {
    if (scaleName === "locrian") return deg === 1 ? "ti" : deg === 3 ? "re" : "se";
    if (isMinorish) return deg === 1 ? "la" : deg === 3 ? "do" : "me";
    return deg === 1 ? "do" : deg === 3 ? "mi" : "sol";
  };

  const targetDegrees = [1, 3, 5, 3, 1] as const;
  const targetLabels = useMemo(
    () => targetDegrees.map((d) => labelForDegree(d)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scaleName]
  );

  // Matcher (waits for correct notes only)
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

  // Auto-advance on pass (with 1s delay)
  const passLatch = useRef(false);
  useEffect(() => {
    if (!running) passLatch.current = false;
  }, [running]);
  useEffect(() => {
    if (running && inResponse && matcher.passed && !passLatch.current) {
      passLatch.current = true;
      queueAdvance();
    }
    if (!matcher.passed) passLatch.current = false;
  }, [running, inResponse, matcher.passed, queueAdvance]);

  // Back-compat skip for any “long” variant text (unchanged)
  useEffect(() => {
    if (!running || !inResponse) return;
    if (statusText.includes("do–mi–sol–do–sol–mi–do–sol–do")) {
      queueAdvance();
    }
  }, [running, inResponse, statusText, queueAdvance]);

  const help = useMemo(() => {
    const pat = targetLabels.join("–");
    if (!running) return "Press Play to start. Then echo the arpeggio.";
    if (!inResponse) return `Listen… the teacher will sing ${pat}.`;
    if (matcher.passed) return "Great! You sang the pattern in order.";
    return "Sing the five notes in order — any tempo or octave.";
  }, [running, inResponse, matcher.passed, targetLabels]);

  const onFooterPlay = async () => {
    if (!running) {
      onStart();
      return;
    }
    if (!callMidis) return;
    try {
      await playMidiList(callMidis, quarterSec);
    } catch {}
  };

  const progress = matcher.capturedDegrees;

  return (
    <div className="mt-2 grid gap-3 rounded-lg border border-[#d2d2d2] bg-[#ebebeb] p-3">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold">{statusText}</div>
        <div className="text-xs opacity-70">Pattern: {targetLabels.join("–")}</div>
      </div>

      {/* Target + helper copy */}
      <div className="rounded-md border border-[#d2d2d2] bg-white/70 px-3 py-2">
        <div className="text-[11px] uppercase tracking-wide text-[#6b6b6b]">Guided Arpeggio</div>
        <div className="text-sm font-semibold">
          Tonic {tonicLabel}
          <span className="ml-2 text-xs font-normal text-[#2d2d2d]">
            Call: five quarters • Response: unguided
          </span>
        </div>
        <div className="mt-1 text-xs text-[#2d2d2d]">{help}</div>

        {/* Progress chips */}
        <div className="mt-2 flex items-center gap-1">
          {targetDegrees.map((deg, i) => {
            const got = progress[i] ?? null;
            const ok = got != null && got === deg;
            const label = targetLabels[i];
            return (
              <span
                key={i}
                className={[
                  "inline-flex items-center justify-center w-10 h-7 rounded-md border text-xs font-semibold",
                  ok
                    ? "bg-[#0f0f0f] text-white border-[#0f0f0f]"
                    : "bg-white text-[#2d2d2d] border-[#dcdcdc]",
                ].join(" ")}
                title={`${ok ? "Matched" : "Waiting…"} (${label})`}
              >
                {label}
              </span>
            );
          })}
        </div>

        <div className="mt-2 text*[11px] text-[#6b6b6b]">
          We only check order, not rhythm. Each note needs ~0.25s hold.
        </div>
      </div>

      {/* Footer: Play / Start */}
      <div className="mt-1 flex items-center justify-end">
        <RoundIconButton
          title={running ? "Play arpeggio" : "Start pre-test"}
          ariaLabel="Play"
          onClick={onFooterPlay}
          disabled={!callMidis}
        >
          <svg viewBox="0 0 24 24" className="w-5 h-5" aria-hidden>
            <path d="M8 5v14l11-7L8 5z" fill="currentColor" />
          </svg>
        </RoundIconButton>
      </div>

      <div className="text-[11px] text-[#6b6b6b]">
        (Lead-in {leadInSec.toFixed(2)}s • quarter {quarterSec.toFixed(2)}s)
      </div>
    </div>
  );
}

function RoundIconButton({
  children,
  title,
  ariaLabel,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  title: string;
  ariaLabel: string;
  onClick: () => void | Promise<void>;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={ariaLabel}
      onClick={onClick}
      disabled={disabled}
      className={[
        "inline-flex items-center justify-center",
        "rounded-full p-2.5 bg-[#ebebeb] text-[#0f0f0f]",
        "hover:opacity-90 active:scale-[0.98] transition",
        "border border-[#dcdcdc] shadow-sm",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0f0f0f]",
        disabled ? "opacity-40 cursor-not-allowed" : "",
      ].join(" ")}
    >
      {children}
    </button>
  );
}
