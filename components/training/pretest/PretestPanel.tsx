// components/training/pretest/PretestPanel.tsx
"use client";

import React from "react";
import SinglePitch from "@/components/training/pretest/single-pitch/SinglePitch";
import DerivedTonic from "@/components/training/pretest/derived-tonic/DerivedTonic";
import GuidedArpeggio from "@/components/training/pretest/guided-arpeggio/GuidedArpeggio";
import InternalArpeggio from "@/components/training/pretest/internal-arpeggio/InternalArpeggio";
import type { ScaleName } from "@/utils/phrase/scales";

type ModeKind =
  | "single_tonic"
  | "derived_tonic"
  | "guided_arpeggio"
  | "internal_arpeggio"
  | undefined;

export default function PretestPanel({
  statusText,
  running,
  inResponse,
  modeKind,
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
  modeKind: ModeKind;
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
  if (modeKind === "single_tonic") {
    return (
      <SinglePitch
        statusText={statusText}
        running={running}
        inResponse={inResponse}
        onStart={onStart}
        onContinue={onContinue}
        bpm={bpm}
        tsNum={tsNum}
        tonicPc={tonicPc}
        lowHz={lowHz}
        liveHz={liveHz}
        confidence={confidence}
        playMidiList={playMidiList}
      />
    );
  }

  if (modeKind === "derived_tonic") {
    return (
      <DerivedTonic
        statusText={statusText}
        running={running}
        inResponse={inResponse}
        onStart={onStart}
        onContinue={onContinue}
        bpm={bpm}
        tsNum={tsNum}
        tonicPc={tonicPc}
        lowHz={lowHz}
        liveHz={liveHz}
        confidence={confidence}
        playMidiList={playMidiList}
      />
    );
  }

  if (modeKind === "guided_arpeggio") {
    return (
      <GuidedArpeggio
        statusText={statusText}
        running={running}
        inResponse={inResponse}
        onStart={onStart}
        onContinue={onContinue}
        bpm={bpm}
        tsNum={tsNum}
        tonicPc={tonicPc}
        lowHz={lowHz}
        scaleName={scaleName}
        liveHz={liveHz}
        confidence={confidence}
        playMidiList={playMidiList}
      />
    );
  }

if (modeKind === "internal_arpeggio") {
  return (
    <InternalArpeggio
      statusText={statusText}
      running={running}
      inResponse={inResponse}
      onStart={onStart}
      onContinue={onContinue}
      bpm={bpm}
      tsNum={tsNum}
      tonicPc={tonicPc}
      lowHz={lowHz}
      scaleName={scaleName}
      liveHz={liveHz}
      confidence={confidence}
      playMidiList={playMidiList} // ⬅️ pass through for A440 cue
    />
  );
}

  // Minimal generic shell for other (upcoming) modes; single footer play button.
  const handleFooterPlay = async () => {
    if (!running) {
      onStart();
      return;
    }
    try {
      // simple cue for unimplemented modes
      await playMidiList([69], 0.75); // A440
    } catch {}
  };

  return (
    <div className="mt-2 grid gap-3 rounded-lg border border-[#d2d2d2] bg-[#ebebeb] p-3">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold">{statusText}</div>
      </div>

      <div className="text-sm text-[#2d2d2d]">
        {modeKind === "internal_arpeggio" && "Internal arpeggio: sing the pattern without a prompt."}
        {!modeKind && "Pre-test step."}
      </div>

      <div className="mt-1 flex items-center justify-end">
        <RoundIconButton title="Play" ariaLabel="Play" onClick={handleFooterPlay}>
          <svg viewBox="0 0 24 24" className="w-5 h-5" aria-hidden>
            <path d="M8 5v14l11-7L8 5z" fill="currentColor" />
          </svg>
        </RoundIconButton>
      </div>
    </div>
  );
}

/** Round icon button matching the side-panel language. */
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
