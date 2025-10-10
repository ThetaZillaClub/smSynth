// components/training/layout/stage/piano-roll/PianoRollCanvas.tsx
"use client";
import React, { useMemo } from "react";
import DynamicOverlay from "./DynamicOverlay";
import { getMidiRange, type Phrase } from "@/utils/stage";
import useMeasuredWidth from "./roll/hooks/useMeasuredWidth";

// Alias the helper so eslint doesn't think it's a React Hook
import { useSharpsForKey as preferSharpsForKey } from "@/utils/pitch/enharmonics";
import type { ScaleName } from "@/utils/phrase/scales";
import type { SolfegeScaleName } from "@/utils/lyrics/solfege";

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

  /** Optional overrides for solfege context (we also use these to LOCK the grid tonic) */
  solfegeTonicPc?: number;
  solfegeScaleName?: SolfegeScaleName;
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
  // Uppercase token so flats hit NOTE_TO_PC (e.g., "Db" -> "DB")
  const root = (m ? `${m[1]}${m[2] ?? ""}`.toUpperCase() : "C");
  const tonicPc = NOTE_TO_PC[root] ?? 0;

  // The rest (mode/scale words)
  const tail = raw.slice(m?.[0]?.length ?? 0).toLowerCase();

  // Map keywords → ScaleName (defaults to "major")
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

// Narrow casts between our identical string unions.
const toSolfegeName = (s: ScaleName): SolfegeScaleName => (s as unknown as SolfegeScaleName);
const fromSolfegeName = (s: SolfegeScaleName): ScaleName => (s as unknown as ScaleName);

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

  // Optional direct solfege overrides (we use these as the source of truth)
  solfegeTonicPc,
  solfegeScaleName,
}: Props) {
  const { hostRef, width } = useMeasuredWidth();

  // --- parse fallback from keySig ---
  const parsed = useMemo(() => parseKeySig(keySig), [keySig]);
  const tonicPcParsed = parsed.tonicPc;
  const scaleParsed = parsed.scale;

  // --- EFFECTIVE scale context (prefer the explicit overrides) ---
  const scaleTonicPcEff = typeof solfegeTonicPc === "number" ? solfegeTonicPc : tonicPcParsed;
  const scaleNameEff: ScaleName = solfegeScaleName ? fromSolfegeName(solfegeScaleName) : scaleParsed;

  // --- Enharmonic preference via util (use the effective scale, not keySig heuristics) ---
  const preferSharps = useMemo(
    () => preferSharpsForKey(scaleTonicPcEff, scaleNameEff),
    [scaleTonicPcEff, scaleNameEff]
  );

  // --- Solfege basis matches the effective scale, too ---
  const solfegeTonicPcEff = scaleTonicPcEff;
  const solfegeScaleEff: SolfegeScaleName = solfegeScaleName ?? toSolfegeName(scaleNameEff);

  // --- One-octave window LOCKED to the *scale tonic*, with phrase-aware octave shift ---
  const [minMidi, maxMidi] = useMemo<[number, number]>(() => {
    const fallbackCenter = 60; // middle C
    const anchorPc = ((scaleTonicPcEff % 12) + 12) % 12;

    if (!phrase || !phrase.notes.length) {
      const oct = Math.floor((fallbackCenter - anchorPc) / 12);
      const min = oct * 12 + anchorPc;
      return [min, min + 13]; // inclusive boundaries: [tonic .. tonic+12]
    }

    const { minMidi: minP, maxMidi: maxP } = getMidiRange(phrase, 2);
    const center = Math.round((minP + maxP) / 2);

    const baseOct = Math.floor((center - anchorPc) / 12);
    let min = baseOct * 12 + anchorPc;
    let max = min + 13; // keep exactly one octave of rows (inclusive upper line)

    // Nudge so phrase sits in/near the window
    if (minP >= max) { min += 12; max += 12; }
    if (maxP < min)  { min -= 12; max -= 12; }

    return [min, max];
  }, [phrase, scaleTonicPcEff]);

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
          // 🔒 lock grid lines & bottom row to the *scale tonic*, not the relative major
          tonicPc={scaleTonicPcEff}
          useSharps={preferSharps}
          showNoteBlocks={showNoteBlocks}
          showNoteBorders={showNoteBorders}
          blocksWhenLyrics={blocksWhenLyrics}
          // 🎵 mode-rotated solfege labels (already correct in your app)
          solfegeTonicPc={solfegeTonicPcEff}
          solfegeScaleName={solfegeScaleEff}
        />
      ) : null}
    </div>
  );
}
