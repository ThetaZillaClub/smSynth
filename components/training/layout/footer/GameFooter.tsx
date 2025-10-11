// components/training/layout/footer/GameFooter.tsx
"use client";

import React from "react";
import GameStats from "./stats/GameStats";
import SessionPanel from "./session/SessionPanel";
import type { ScaleName } from "@/utils/phrase/scales";

type FooterSession = React.ComponentProps<typeof SessionPanel>;

type FooterAction = {
  label: string;
  onClick: () => void | Promise<void>;
  disabled?: boolean;
  title?: string;
};

type FooterProps = {
  showPlay?: boolean;
  running: boolean;
  onToggle: () => void;

  // stats inputs
  livePitchHz?: number | null;
  isReady?: boolean;
  error?: string | null;

  confidence: number;
  confThreshold?: number;

  keySig?: string | null;
  clef?: "treble" | "bass" | null;
  lowHz?: number | null;
  highHz?: number | null;

  /** Optional: show the new session panel to the right of the play button */
  sessionPanel?: FooterSession;

  /** Left meta panel */
  scaleName?: ScaleName | null;

  /** 🔒 NEW: lock Key to absolute tonic, independent of scale type */
  tonicPc?: number | null;

  /** NEW: footer actions */
  tonicAction?: FooterAction;
  arpAction?: FooterAction;
};

function MetaItem({
  label,
  value,
  className,
}: {
  label: string;
  value: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex flex-col items-start ${className ?? ""}`}>
      <div className="text-xs text-[#2d2d2d] leading-none">{label}</div>
      <div className="text-lg leading-tight text-[#0f0f0f] whitespace-nowrap tabular-nums">
        {value}
      </div>
    </div>
  );
}

const SCALE_LABEL: Record<ScaleName, string> = {
  major: "Major",
  natural_minor: "Aeolian",
  harmonic_minor: "Harmonic Minor",
  melodic_minor: "Melodic Minor",
  dorian: "Dorian",
  phrygian: "Phrygian",
  lydian: "Lydian",
  mixolydian: "Mixolydian",
  locrian: "Locrian",
  major_pentatonic: "Major Pentatonic",
  minor_pentatonic: "Minor Pentatonic",
  chromatic: "Chromatic",
};

function friendlyScaleLabel(
  scaleName: ScaleName | null | undefined,
  keySig: string | null | undefined
): string {
  if (scaleName && SCALE_LABEL[scaleName]) return SCALE_LABEL[scaleName];
  if (keySig) {
    const tail = keySig.toLowerCase();
    if (/\bharmonic\s*minor\b/.test(tail)) return "Harmonic Minor";
    if (/\bmelodic\s*minor\b/.test(tail)) return "Melodic Minor";
    if (/\bminor\b|\baeolian\b/.test(tail)) return "Aeolian";
    if (/\bdorian\b/.test(tail)) return "Dorian";
    if (/\bphrygian\b/.test(tail)) return "Phrygian";
    if (/\blydian\b/.test(tail)) return "Lydian";
    if (/\bmixolydian\b/.test(tail)) return "Mixolydian";
    if (/\blocrian\b/.test(tail)) return "Locrian";
    if (/\bmajor\b|\bionian\b/.test(tail)) return "Major";
    if (/\bchromatic\b/.test(tail)) return "Chromatic";
    if (/\bmajor\s*penta|\bpentatonic\s*major\b/.test(tail))
      return "Major Pentatonic";
    if (/\bminor\s*penta|\bpentatonic\s*minor\b/.test(tail))
      return "Minor Pentatonic";
  }
  return "—";
}

/* Play/Pause button (unchanged size) */
function PlayPauseButton({
  running,
  onToggle,
}: {
  running: boolean;
  onToggle: () => void;
}) {
  const base = [
    "relative inline-flex items-center justify-center",
    "w-14 h-14 md:w-16 md:h-16 rounded-full",
    "bg-gradient-to-b from-[#fefefe] to-zinc-50 text-zinc-900",
    "ring-1 ring-inset ring-black/5",
    "shadow-[inset_0_1px_0_rgba(255,255,255,0.8),0_8px_24px_rgba(0,0,0,0.08)]",
    "hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_12px_28px_rgba(0,0,0,0.12)]",
    "hover:ring-black/10",
    "active:scale-95",
    "focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-sky-300/40",
    "transition-all duration-200",
    "overflow-visible", // ensure the inner glow is never clipped by the button
  ].join(" ");

  const runningAccent = running
    ? "ring-green-500/40 shadow-[0_0_0_3px_rgba(16,185,129,0.15),0_12px_32px_rgba(16,185,129,0.22)]"
    : "";

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={running ? "Pause" : "Play"}
      aria-pressed={running}
      title={running ? "Pause" : "Play"}
      className={`${base} ${runningAccent}`}
    >
      {/* Outer green glow — extend beyond bounds; wrapper/containers allow overflow */}
      <span
        aria-hidden
        className={`pointer-events-none absolute -inset-2 rounded-full blur transition-opacity duration-300 bg-green-400/25 ${
          running ? "opacity-100" : "opacity-0"
        }`}
      />
      <span className="relative block w-8 h-8 md:w-9 md:h-9">
        <svg
          viewBox="0 0 24 24"
          aria-hidden
          className={`absolute inset-0 w-full h-full transition-opacity duration-150 ${
            running ? "opacity-0" : "opacity-100"
          }`}
        >
          <path d="M8 5v14l11-7z" fill="currentColor" />
        </svg>
        <svg
          viewBox="0 0 24 24"
          aria-hidden
          className={`absolute inset-0 w-full h-full transition-opacity duration-150 ${
            running ? "opacity-100" : "opacity-0"
          }`}
        >
          <path d="M6 5h5v14H6zM13 5h5v14h-5z" fill="currentColor" />
        </svg>
      </span>
    </button>
  );
}

/** 🔧 Smaller circular footer action buttons (Tonic / Arp) */
function FooterActionButton({ label, onClick, disabled, title }: FooterAction) {
  const len = (label ?? "").length;

  const base = [
    "relative inline-flex items-center justify-center",
    "w-11 h-11 md:w-12 md:h-12 rounded-full",
    "bg-gradient-to-b from-[#fefefe] to-zinc-50 text-zinc-900",
    "ring-1 ring-inset ring-black/5",
    "shadow-[inset_0_1px_0_rgba(255,255,255,0.8),0_8px_24px_rgba(0,0,0,0.08)]",
    "hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_12px_28px_rgba(0,0,0,0.12)]",
    "hover:ring-black/10",
    "active:scale-95",
    "focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-sky-300/40",
    "transition-all duration-200",
    "overflow-visible",
    disabled ? "opacity-40 cursor-not-allowed" : "",
  ].join(" ");

  const textSize = len > 10 ? "text-[10px]" : "text-xs md:text-sm";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title ?? label}
      aria-label={title ?? label}
      className={base}
    >
      <span className={`relative z-10 px-1 font-semibold tracking-tight tabular-nums ${textSize}`}>
        {label}
      </span>
    </button>
  );
}

/** Label stacked above an action button (used for Key / Arp) */
function LabeledAction({
  topLabel,
  action,
}: {
  topLabel: string;
  action: FooterAction;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-1 min-w-[3.25rem] overflow-visible">
      <div className="text-xs text-[#2d2d2d] leading-none">{topLabel}</div>
      <FooterActionButton {...action} />
    </div>
  );
}

export default function GameFooter({
  showPlay = false,
  running,
  onToggle,
  livePitchHz,
  isReady = false,
  error,
  confidence,
  confThreshold = 0.5,
  keySig = null,
  clef = null,
  lowHz = null,
  highHz = null,
  sessionPanel,
  scaleName = null,
  tonicPc = null,
  tonicAction,
  arpAction,
}: FooterProps) {
  const scaleText = friendlyScaleLabel(scaleName, keySig);

  return (
    <footer className="w-full bg-transparent px-4 md:px-6 py-3 overflow-visible">
      <div className="w-[90%] mx-auto overflow-visible">
        <div className="rounded-2xl shadow-[0_6px_24px_rgba(0,0,0,0.12)] px-3 md:px-4 py-2 bg-[#f1f1f1] overflow-visible">
          <div className="grid grid-cols-[1fr_auto_minmax(0,1fr)] items-center gap-4 overflow-visible">
            {/* LEFT cluster: Scale + actions (Tonic/Arp with labels above) */}
            <div className="justify-self-start w-full min-w-0 overflow-visible">
              <div className="w-full flex items-center justify-start gap-x-4 flex-nowrap overflow-visible">
                <MetaItem className="w-[9rem] flex-none" label="Scale" value={scaleText} />

                {(tonicAction || arpAction) ? (
                  <div className="ml-1 flex items-center gap-3 overflow-visible">
                    {tonicAction ? (
                      <LabeledAction topLabel="Tonic" action={tonicAction} />
                    ) : null}
                    {arpAction ? (
                      <LabeledAction topLabel="Triad" action={arpAction} />
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>

            {/* center: play/pause (wrap allows glow outside) */}
            <div className="justify-self-center overflow-visible">
              {showPlay ? (
                <div className="relative p-1 overflow-visible">
                  <PlayPauseButton running={running} onToggle={onToggle} />
                </div>
              ) : (
                <div className="w-16 h-16" aria-hidden />
              )}
            </div>

            {/* RIGHT cluster: session panel + (trimmed) stats */}
            <div className="justify-self-end w-full min-w-0 overflow-visible">
              <div className="w-full flex items-center justify-end gap-x-4 flex-nowrap">
                {sessionPanel ? <SessionPanel {...sessionPanel} /> : null}
                <GameStats
                  livePitchHz={livePitchHz}
                  isReady={isReady}
                  error={error}
                  confidence={confidence}
                  confThreshold={confThreshold}
                  keySig={keySig}
                  clef={clef}
                  lowHz={lowHz}
                  highHz={highHz}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
