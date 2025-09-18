// components/training/curriculum-layout/Options.ts
import type { NoteValue } from "@/utils/time/tempo";
import type { ScaleName } from "@/utils/phrase/scales";

export const NOTE_VALUE_OPTIONS: { label: string; value: NoteValue }[] = [
  { label: "Whole", value: "whole" },
  { label: "Dotted Half", value: "dotted-half" },
  { label: "Half", value: "half" },
  { label: "Dotted Quarter", value: "dotted-quarter" },
  { label: "Triplet Quarter", value: "triplet-quarter" },
  { label: "Quarter", value: "quarter" },
  { label: "Dotted Eighth", value: "dotted-eighth" },
  { label: "Triplet Eighth", value: "triplet-eighth" },
  { label: "Eighth", value: "eighth" },
  { label: "Dotted Sixteenth", value: "dotted-sixteenth" },
  { label: "Triplet Sixteenth", value: "triplet-sixteenth" },
  { label: "Sixteenth", value: "sixteenth" },
  { label: "Thirty-second", value: "thirtysecond" },
];

export const TONIC_OPTIONS = [
  { label: "C", value: 0 }, { label: "C#", value: 1 }, { label: "D", value: 2 }, { label: "D#", value: 3 },
  { label: "E", value: 4 }, { label: "F", value: 5 }, { label: "F#", value: 6 }, { label: "G", value: 7 },
  { label: "G#", value: 8 }, { label: "A", value: 9 }, { label: "A#", value: 10 }, { label: "B", value: 11 },
];

export const SCALE_OPTIONS: { label: string; value: ScaleName }[] = [
  { label: "Major", value: "major" },
  { label: "Natural Minor", value: "natural_minor" },
  { label: "Harmonic Minor", value: "harmonic_minor" },
  { label: "Melodic Minor", value: "melodic_minor" },
  { label: "Dorian", value: "dorian" },
  { label: "Phrygian", value: "phrygian" },
  { label: "Lydian", value: "lydian" },
  { label: "Mixolydian", value: "mixolydian" },
  { label: "Locrian", value: "locrian" },
  { label: "Major Pentatonic", value: "major_pentatonic" },
  { label: "Minor Pentatonic", value: "minor_pentatonic" },
  { label: "Chromatic", value: "chromatic" },
];
