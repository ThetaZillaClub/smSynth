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
    ["minor", "aeolian", "dorian", "phrygian", "harmonic_minor", "melodic_minor"] as unknown as ScaleName[]
  );
  const dim5 = new Set<ScaleName>(["locrian"] as unknown as ScaleName[]);
  const third = name && minorish.has(name) ? 3 : 4;
  const fifth = name && dim5.has(name) ? 6 : 7;
  return { third, fifth };
}

export default function InternalArpeggio({
  statusText, // kept for prop compatibility; not shown
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
  const { quarterSec, requiredHoldSec } = usePitchTuneDurations({ bpm, tsNum });
  const { third, fifth } = triadOffsetsForScale(scaleName);

  // Tonic selection
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

  // Phase control
  const [phase, setPhase] = useState<"tonic" | "arp">("tonic");
  useEffect(() => {
    if (!running || !inResponse) setPhase("tonic");
  }, [running, inResponse]);

  // Step 1: hold the tonic (after A440 cue)
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

  // Latch complete for Step 1
  const tonicCompleteRef = useRef(false);
  useEffect(() => {
    if (phase === "tonic" && gate.passed) tonicCompleteRef.current = true;
    if (!running) tonicCompleteRef.current = false;
  }, [phase, gate.passed, running]);

  const tonicPctRaw = Math.max(
    0,
    Math.min(1, requiredHoldSec ? Math.min(gate.heldSec, requiredHoldSec) / requiredHoldSec : 0)
  );
  const tonicProgress = tonicCompleteRef.current ? 1 : tonicPctRaw;

  // Advance to Step 2 once tonic passes
  useEffect(() => {
    if (phase === "tonic" && gate.passed) {
      setPhase("arp");
    }
  }, [phase, gate.passed]);

  // Step 2: internal (unguided) arpeggio matcher: 1–3–5–3–1
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

  const arpCompleteRef = useRef(false);
  useEffect(() => {
    if (phase === "arp" && matcher.passed) arpCompleteRef.current = true;
    if (!running) arpCompleteRef.current = false;
  }, [phase, matcher.passed, running]);

  const arpCount = matcher.capturedDegrees.length;
  const arpPctRaw = Math.max(0, Math.min(1, arpCount / 5));
  const arpProgress = arpCompleteRef.current ? 1 : arpPctRaw;

  // 🔁 Robust auto-advance after full arpeggio — fire once regardless of inResponse
  const advanceTimerRef = useRef<number | null>(null);
  const passQueuedRef = useRef(false);

  // reset latch/timer when leaving arp phase or stopping
  useEffect(() => {
    if (!running || phase !== "arp") {
      passQueuedRef.current = false;
      if (advanceTimerRef.current) window.clearTimeout(advanceTimerRef.current);
      advanceTimerRef.current = null;
    }
  }, [running, phase]);

  useEffect(() => {
    if (phase === "arp" && matcher.passed && !passQueuedRef.current) {
      passQueuedRef.current = true;
      if (advanceTimerRef.current) window.clearTimeout(advanceTimerRef.current);
      advanceTimerRef.current = window.setTimeout(onContinue, 800);
    }
  }, [phase, matcher.passed, onContinue]);

  useEffect(() => {
    return () => {
      if (advanceTimerRef.current) window.clearTimeout(advanceTimerRef.current);
    };
  }, []);

  const showTonicPhase = phase === "tonic";
  const targetDegrees = [1, 3, 5, 3, 1] as const;

  // Button behavior
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
    // No playback in arp phase (internal)
  };

  const help = useMemo(() => {
    if (showTonicPhase) {
      if (!running) return "Press Play to hear A440. Then derive the tonic and hold it.";
      if (!inResponse) return "Listen… A440 will play first.";
      if (gate.passed) return "Great! You found and held the tonic.";
      if (gate.failed) return "Close. Re-center on the tonic and hold steady.";
      return "Sing the tonic you’ve derived from A440 and hold it…";
    }
    if (matcher.passed) return "Nice! You sang 1–3–5–3–1.";
    return "Sing the five notes in order — any tempo or octave.";
  }, [showTonicPhase, running, inResponse, gate.passed, gate.failed, matcher.passed]);

  return (
    <div className="rounded-xl bg-[#f2f2f2] border border-[#dcdcdc] p-3 shadow-sm">
      <div className="text-[11px] uppercase tracking-wide text-[#6b6b6b]">
        {showTonicPhase ? "Internal Arpeggio — Step 1: Tonic (A440 cue)" : "Internal Arpeggio — Step 2: 1–3–5–3–1"}
      </div>
      <p className="mt-1 text-xs text-[#373737]">{help}</p>
      {!showTonicPhase && (
        <div className="mt-0.5 text-[11px] text-[#6b6b6b]">Tonic {tonicLabel} • We check order only; each ~0.25s.</div>
      )}

      <div className="mt-3 flex justify-center">
        <PlayProgressButton
          label={showTonicPhase ? "A4" : "1–3–5–3–1"}
          ariaLabel={showTonicPhase ? "Cue A4" : "Arpeggio 1–3–5–3–1"}
          tooltip={showTonicPhase ? "Play cue (A4)" : "Internal arpeggio (no playback)"}
          onToggle={onButtonClick}
          progress={showTonicPhase ? tonicProgress : arpProgress}
          complete={showTonicPhase ? tonicCompleteRef.current : arpCompleteRef.current}
          disabled={!showTonicPhase /* no playback in step 2 */}
          size={72}
        />
      </div>

      {/* Compact degree chips under the button for clarity */}
      {!showTonicPhase && (
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
      )}
    </div>
  );
}
