// components/training/layout/stage/piano-roll/PianoRollCanvas.tsx
"use client";
import React, { useMemo } from "react";
import DynamicOverlay from "./DynamicOverlay";
import { getMidiRange, type Phrase } from "@/utils/stage";
import useMeasuredWidth from "./roll/hooks/useMeasuredWidth";

import { useSharpsForKey } from "@/utils/pitch/enharmonics";
import type { ScaleName } from "@/utils/phrase/scales";

/** Re-export so upstream can import { type Phrase } from this file */
export type { Phrase };

type Props = {
  height: number;
  phrase: Phrase | null;
  running: boolean;
  onActiveNoteChange?: (idx: number) => void;
  livePitchHz?: number | null;
  confidence?: number;
  confThreshold?: number;
  leadInSec?: number;
  startAtMs?: number | null;
  lyrics?: string[];
  windowSec?: number;
  anchorRatio?: number;
  /** Examples: "C", "C major", "C dorian", "Bb Phrygian", "F# melodic minor" */
  keySig?: string | null;

  /** Visual toggles (pass-through to DynamicOverlay) */
  showNoteBlocks?: boolean;    // default true
  showNoteBorders?: boolean;   // default true
  blocksWhenLyrics?: boolean;  // default false (so text-only when lyrics exist)
};

/* -----------------------------------------------------------
   Helpers: parse tonic + scale from a flexible keySig string
----------------------------------------------------------- */

const NOTE_TO_PC: Record<string, number> = {
  C: 0, "B#": 0,
  "C#": 1, DB: 1,
  D: 2,
  "D#": 3, EB: 3,
  E: 4, "FB": 4,
  F: 5, "E#": 5,
  "F#": 6, GB: 6,
  G: 7,
  "G#": 8, AB: 8,
  A: 9,
  "A#": 10, BB: 10,
  B: 11, CB: 11,
};

function parseKeySig(rawIn: string | null | undefined): { tonicPc: number; scale: ScaleName } {
  const raw = (rawIn ?? "C").replace("♯", "#").replace("♭", "b").trim();

  // Extract the root note from the beginning: letter + optional accidental
  const m = raw.match(/^([A-Ga-g])\s*(#|b)?/);
  const root = (m ? (m[1].toUpperCase() + (m[2] ?? "")) : "C") as string;
  const tonicPc = NOTE_TO_PC[root] ?? 0;

  // The rest (mode/scale words)
  const tail = raw.slice(m?.[0]?.length ?? 0).toLowerCase();

  // Map keywords → ScaleName (defaults to "major")
  // Accepts plenty of aliases; order matters (more specific first).
  let scale: ScaleName = "major";
  const sets: Array<[RegExp, ScaleName]> = [
    [/harmonic\s*minor/, "harmonic_minor"],
    [/melodic\s*minor/, "melodic_minor"],
    [/natural\s*minor|aeolian|^minor\b|\bminor\b/, "natural_minor"],
    [/dorian/, "dorian"],
    [/phrygian/, "phrygian"],
    [/lydian/, "lydian"],
    [/mixolydian/, "mixolydian"],
    [/locrian/, "locrian"],
    [/major\s*penta|pentatonic\s*major/, "major_pentatonic"],
    [/minor\s*penta|pentatonic\s*minor/, "minor_pentatonic"],
    [/chromatic/, "chromatic"],
    [/major|ionian/, "major"],
  ];
  for (const [re, name] of sets) {
    if (re.test(tail)) { scale = name; break; }
  }

  return { tonicPc, scale };
}

export default function PianoRollCanvas({
  height,
  phrase,
  running,
  onActiveNoteChange,
  livePitchHz = null,
  confidence = 0,
  confThreshold = 0.5,
  leadInSec = 1.5,
  startAtMs = null,
  lyrics,
  windowSec = 4,
  anchorRatio = 0.1,
  keySig = null,
  showNoteBlocks = true,
  showNoteBorders = true,
  blocksWhenLyrics = true,
}: Props) {
  const { hostRef, width } = useMeasuredWidth();

  // --- tonic + scale parsed from keySig (mode words ignored for tonic) ---
  const { tonicPc, scale } = useMemo(() => parseKeySig(keySig), [keySig]);

  // --- Enharmonic preference via your util (uses relative-major logic per scale) ---
  const useSharps = useMemo(() => useSharpsForKey(tonicPc, scale), [tonicPc, scale]);

  // --- One-octave window anchored to tonic, with phrase-aware octave shift ---
  const [minMidi, maxMidi] = useMemo<[number, number]>(() => {
    const fallbackCenter = 60; // middle C
    if (!phrase || !phrase.notes.length) {
      const oct = Math.floor((fallbackCenter - tonicPc) / 12);
      const min = oct * 12 + tonicPc;
      return [min, min + 13]; // inclusive octave [tonic..tonic]
    }

    const { minMidi: minP, maxMidi: maxP } = getMidiRange(phrase, 2);
    const center = Math.round((minP + maxP) / 2);

    let baseOct = Math.floor((center - tonicPc) / 12);
    let min = baseOct * 12 + tonicPc;
    let max = min + 13; // keep *exactly* one octave

    // Nudge by octaves so the phrase sits in/near the window
    if (minP >= max) { min += 12; max += 12; }
    if (maxP < min)  { min -= 12; max -= 12; }

    return [min, max];
  }, [phrase, tonicPc]);

  if (!phrase || phrase.notes.length === 0) {
    return <div ref={hostRef} className="relative w-full" style={{ height }} />;
  }

  return (
    <div ref={hostRef} className="relative w-full" style={{ height }}>
      {width && width > 4 ? (
        <DynamicOverlay
          width={width}
          height={height}
          phrase={phrase}
          running={running}
          onActiveNoteChange={onActiveNoteChange}
          minMidi={minMidi}
          maxMidi={maxMidi}
          windowSec={windowSec}
          anchorRatio={anchorRatio}
          livePitchHz={livePitchHz}
          confidence={confidence}
          confThreshold={confThreshold}
          a4Hz={440}
          leadInSec={leadInSec}
          startAtMs={startAtMs}
          lyrics={lyrics}
          tonicPc={tonicPc}
          useSharps={useSharps}
          showNoteBlocks={showNoteBlocks}
          showNoteBorders={showNoteBorders}
          blocksWhenLyrics={blocksWhenLyrics}
        />
      ) : null}
    </div>
  );
}
