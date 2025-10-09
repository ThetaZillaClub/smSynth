"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import usePitchTuneDurations from "@/components/games/pitch-tune/hooks/usePitchTuneDurations";
import useSustainPass from "@/hooks/call-response/useSustainPass";
import { hzToMidi, midiToHz, midiToNoteName } from "@/utils/pitch/pitchMath";
import useGuidedArpMatcher from "@/components/training/pretest/guided-arpeggio/hooks/useGuidedArpMatcher";
import type { ScaleName } from "@/utils/phrase/scales";

function triadOffsetsForScale(name?: ScaleName) {
  const minorish = new Set<ScaleName>(
    ["minor", "aeolian", "dorian", "phrygian", "harmonic_minor", "melodic_minor"] as unknown as ScaleName[]
  );
  const dim5 = new Set<ScaleName>(["locrian"] as unknown as ScaleName[]);
  const third = name && minorish.has(name) ? 3 : 4;
  const fifth = name && dim5.has(name) ? 6 : 7;
  return { third, fifth };
}

export default function InternalArpeggio({
  statusText,
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
  playMidiList, // used to play A440
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
  const { quarterSec, leadInSec, requiredHoldSec } = usePitchTuneDurations({ bpm, tsNum });
  const { third, fifth } = triadOffsetsForScale(scaleName);

  // Tonic selection (same logic as GuidedArpeggio)
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

  // Phase handled with STATE so UI updates properly
  const [phase, setPhase] = useState<"tonic" | "arp">("tonic");
  useEffect(() => {
    if (!running || !inResponse) setPhase("tonic");
  }, [running, inResponse]);

  // Step 1: hold the derived tonic (after an A440 cue)
  const gate = useSustainPass({
    active: running && inResponse && phase === "tonic" && tonicHz != null,
    targetHz: tonicHz,
    liveHz,
    confidence,
    confMin: 0.6,
    centsTol: 60,
    holdSec: requiredHoldSec,
    retryAfterSec: 6,
  });

  // Advance to step 2 when tonic passes (no delay here; delay only before *next pretest*)
  useEffect(() => {
    if (running && inResponse && phase === "tonic" && gate.passed) {
      setPhase("arp");
    }
  }, [running, inResponse, phase, gate.passed]);

  // Step 2: unguided arpeggio matcher (1–3–5–3–1), waiting for correct notes only
  const matcher = useGuidedArpMatcher({
    active: running && inResponse && phase === "arp" && tonicMidi != null,
    tonicMidi: tonicMidi ?? 60,
    thirdSemitones: third,
    fifthSemitones: fifth,
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

  // Finish when arpeggio sequence matches (with 1s delay)
  useEffect(() => {
    if (running && inResponse && phase === "arp" && matcher.passed) {
      queueAdvance();
    }
  }, [running, inResponse, phase, matcher.passed, queueAdvance]);

  const showTonicPhase = phase === "tonic";
  const target = [1, 3, 5, 3, 1] as const;
  const progress = matcher.capturedDegrees;

  const onFooterPlay = async () => {
    if (!running) {
      onStart();
      try {
        await playMidiList([69], Math.min(quarterSec, requiredHoldSec)); // A4
      } catch {}
      return;
    }
    if (showTonicPhase) {
      try {
        await playMidiList([69], Math.min(quarterSec, requiredHoldSec));
      } catch {}
    }
  };

  const playBtnTitle = !running
    ? "Start + Play A440"
    : showTonicPhase
    ? "Play A440"
    : "Arpeggio — no playback";

  return (
    <div className="mt-2 grid gap-3 rounded-lg border border-[#d2d2d2] bg-[#ebebeb] p-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold">{statusText}</div>
        <div className="text-xs opacity-70">Internal Arpeggio</div>
      </div>

      {/* Target + helper copy */}
      <div className="rounded-md border border-[#d2d2d2] bg-white/70 px-3 py-2">
        <div className="text-[11px] uppercase tracking-wide text-[#6b6b6b]">
          {showTonicPhase ? "Step 1 of 2 — Derived Tonic (A440 cue)" : "Step 2 of 2 — Unguided Arpeggio"}
        </div>
        <div className="text-sm font-semibold">
          {showTonicPhase ? (
            <>
              Tonic (internal) {tonicLabel}
              <span className="ml-2 text-xs font-normal text-[#2d2d2d]">
                Hold for {requiredHoldSec.toFixed(2)}s
              </span>
            </>
          ) : (
            <>
              Pattern: 1–3–5–3–1
              <span className="ml-2 text-xs font-normal text-[#2d2d2d]">No playback</span>
            </>
          )}
        </div>
        <div className="mt-1 text-xs text-[#2d2d2d]">
          {showTonicPhase
            ? !running
              ? "Press Play to start and hear A440. Then derive and hold the tonic."
              : "Listen… A440 will play. Then hold the tonic steady."
            : "Sing the five notes in order (any tempo or octave)."}
        </div>
      </div>

      {/* Progress panel */}
      {showTonicPhase ? (
        <div className="rounded-md border border-[#d2d2d2] bg-white/70 px-3 py-2">
          <div className="text-[11px] uppercase tracking-wide text-[#6b6b6b]">Hold progress</div>
          <div className="mt-1 h-2 rounded-full bg-[#ebebeb] overflow-hidden border border-[#dcdcdc]">
            <div
              className="h-full bg-[#0f0f0f]"
              style={{ width: `${Math.round(Math.min(1, (gate.heldSec ?? 0) / requiredHoldSec) * 100)}%` }}
            />
          </div>
          <div className="mt-1 text-xs text-[#2d2d2d]">
            Held {Math.min(gate.heldSec, requiredHoldSec).toFixed(2)}s / {requiredHoldSec.toFixed(2)}s
            {gate.lastCents != null && <span className="ml-2">({gate.lastCents}¢)</span>}
          </div>
        </div>
      ) : (
        <div className="rounded-md border border-[#d2d2d2] bg-white/70 px-3 py-2">
          <div className="text-[11px] uppercase tracking-wide text-[#6b6b6b]">Arpeggio progress</div>
          <div className="mt-2 flex items-center gap-1">
            {target.map((deg, i) => {
              const got = progress[i] ?? null;
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
          <div className="mt-2 text-[11px] text-[#6b6b6b]">
            We check order only (1–3–5–3–1), not rhythm. Each needs ~0.25s hold.
          </div>
        </div>
      )}

      {/* Single control button */}
      <div className="mt-1 flex items-center justify-end">
        <RoundIconButton title={playBtnTitle} ariaLabel="Play" onClick={onFooterPlay} disabled={running && !showTonicPhase}>
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
