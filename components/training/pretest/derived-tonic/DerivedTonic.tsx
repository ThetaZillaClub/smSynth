"use client";

import React, { useCallback, useEffect, useMemo, useRef } from "react";
import usePitchTuneDurations from "@/components/games/pitch-tune/hooks/usePitchTuneDurations";
import useSustainPass from "@/hooks/call-response/useSustainPass";
import { hzToMidi, midiToHz, midiToNoteName } from "@/utils/pitch/pitchMath";

export default function DerivedTonic({
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
  const { quarterSec, leadInSec, requiredHoldSec } = usePitchTuneDurations({ bpm, tsNum });

  // Target is still the tonic (low tonic root from range)
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
  const pct = Math.max(0, Math.min(1, requiredHoldSec ? held / requiredHoldSec : 0));

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

  const help = useMemo(() => {
    if (!running) return "Press Play to hear A440. Then derive the tonic and hold it.";
    if (!inResponse) return "Listen… A440 will play first.";
    if (gate.passed) return "Great! You found and held the tonic.";
    if (gate.failed) return "Close. Re-center on the tonic and hold steady.";
    return "Sing the tonic you’ve derived from A440 and hold it…";
  }, [running, inResponse, gate.passed, gate.failed]);

  // Footer Play behavior:
  // - first click starts (handled upstream via onStart)
  // - subsequent clicks replay the teacher cue (A440)
  const onFooterPlay = async () => {
    if (!running) {
      onStart();
      return;
    }
    try {
      // A4 (MIDI 69)
      await playMidiList([69], Math.min(quarterSec, requiredHoldSec));
    } catch {}
  };

  return (
    <div className="mt-2 grid gap-3 rounded-lg border border-[#d2d2d2] bg-[#ebebeb] p-3">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold">{statusText}</div>
      </div>

      {/* Target + helper copy */}
      <div className="rounded-md border border-[#d2d2d2] bg-white/70 px-3 py-2">
        <div className="text-[11px] uppercase tracking-wide text-[#6b6b6b]">Derived Tonic</div>
        <div className="text-sm font-semibold">
          Target {tonicLabel}
          <span className="ml-2 text-xs font-normal text-[#2d2d2d]">
            Hold for {requiredHoldSec.toFixed(2)}s
          </span>
        </div>
        <div className="mt-1 text-xs text-[#2d2d2d]">{help}</div>
        <div className="mt-1 text-[11px] text-[#6b6b6b]">
          (Cue is A440; derive tonic via intervals & key context.)
        </div>
      </div>

      {/* Progress */}
      <div className="rounded-md border border-[#d2d2d2] bg-white/70 px-3 py-2">
        <div className="text-[11px] uppercase tracking-wide text-[#6b6b6b]">Hold progress</div>
        <div className="mt-1 h-2 rounded-full bg-[#ebebeb] overflow-hidden border border-[#dcdcdc]">
          <div className="h-full bg-[#0f0f0f] transition-[width]" style={{ width: `${Math.round(pct * 100)}%` }} />
        </div>
        <div className="mt-1 text-xs text-[#2d2d2d]">
          Held {held.toFixed(2)}s / {requiredHoldSec.toFixed(2)}s
          {gate.lastCents != null && <span className="ml-2">({gate.lastCents}¢)</span>}
        </div>
      </div>

      {/* Footer */}
      <div className="mt-1 flex items-center justify-end">
        <RoundIconButton title={running ? "Play A440" : "Start pre-test"} ariaLabel="Play" onClick={onFooterPlay}>
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
