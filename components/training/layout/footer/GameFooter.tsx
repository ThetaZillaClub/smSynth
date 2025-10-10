// components/training/layout/footer/GameFooter.tsx
"use client";

import React from "react";
import GameStats from "./stats/GameStats";
import SessionPanel from "./session/SessionPanel";
import type { ScaleName } from "@/utils/phrase/scales";

type FooterSession = React.ComponentProps<typeof SessionPanel>;

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
};

/** Small display item matching the style of other footer elements */
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
      <div className="text-xs text-[#2d2d2d]">{label}</div>
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
    if (/\bmajor\s*penta|\bpentatonic\s*major\b/.test(tail)) return "Major Pentatonic";
    if (/\bminor\s*penta|\bpentatonic\s*minor\b/.test(tail)) return "Minor Pentatonic";
  }
  return "—";
}

/** NEW: absolute tonic → key label (defaults to sharps; uses flats if keySig clearly signals flats) */
function pcToKeyLabel(pc: number | null | undefined, keySig?: string | null): string {
  if (pc == null || !Number.isFinite(pc)) return "—";
  const namesSharp = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"] as const;
  const namesFlat  = ["C","Db","D","Eb","E","F","Gb","G","Ab","A","Bb","B"] as const;
  const preferFlats =
    typeof keySig === "string" && /b/.test(keySig) && !/#/.test(keySig);
  const idx = ((pc % 12) + 12) % 12;
  return (preferFlats ? namesFlat : namesSharp)[idx];
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
  tonicPc = null, // NEW
}: FooterProps) {
  const keyText = pcToKeyLabel(tonicPc, keySig); // 🔒 locked
  const scaleText = friendlyScaleLabel(scaleName, keySig);

  return (
    <footer className="w-full bg-transparent px-4 md:px-6 py-3">
      <div className="w-[90%] mx-auto">
        <div className="rounded-2xl shadow-[0_6px_24px_rgba(0,0,0,0.12)] px-3 md:px-4 py-2 bg-[#f1f1f1]">
          <div className="grid grid-cols-[1fr_auto_minmax(0,1fr)] items-center gap-4">
            {/* LEFT cluster: Key & Scale */}
            <div className="justify-self-start w-full min-w-0 overflow-hidden">
              <div className="w-full flex items-center justify-start gap-x-4 flex-nowrap">
                <MetaItem className="w-[6.5rem] flex-none" label="Key" value={keyText} />
                <MetaItem className="w-[9rem] flex-none" label="Scale" value={scaleText} />
              </div>
            </div>

            {/* center: play/pause */}
            <div className="justify-self-center">
              {showPlay ? (
                <button
                  type="button"
                  onClick={onToggle}
                  aria-label={running ? "Pause" : "Play"}
                  className="inline-flex items-center justify-center rounded-full p-3 bg-[#ebebeb] text-[#0f0f0f] hover:opacity-90 active:scale-[0.98] transition"
                >
                  {running ? (
                    <svg viewBox="0 0 24 24" className="w-10 h-10" aria-hidden>
                      <path d="M6 5h5v14H6zM13 5h5v14h-5z" fill="currentColor" />
                    </svg>
                  ) : (
                    <svg viewBox="0 0 24 24" className="w-10 h-10" aria-hidden>
                      <path d="M8 5v14l11-7z" fill="currentColor" />
                    </svg>
                  )}
                </button>
              ) : (
                <div className="w-10 h-10" aria-hidden />
              )}
            </div>

            {/* RIGHT cluster: session panel + stats */}
            <div className="justify-self-end w-full min-w-0 overflow-hidden">
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
