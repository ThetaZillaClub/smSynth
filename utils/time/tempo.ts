// utils/time/tempo.ts

export type TimeSignature = { num: number; den: number };

/** Parse strings like "4/4", "7/8", "3/2". Falls back to 4/4. */
export function parseTimeSignature(ts: string | null | undefined): TimeSignature {
  if (!ts) return { num: 4, den: 4 };
  const m = String(ts).trim().match(/^(\d+)\s*\/\s*(\d+)$/);
  if (!m) return { num: 4, den: 4 };
  const num = Math.max(1, Math.floor(Number(m[1])));
  const den = Math.max(1, Math.floor(Number(m[2])));
  return { num: Number.isFinite(num) ? num : 4, den: Number.isFinite(den) ? den : 4 };
}

/** Seconds per *beat unit* (where beat unit = denominator note, e.g., 4=quarter, 8=eighth). */
export function secondsPerBeat(bpm: number, den: number): number {
  const B = Math.max(1, Number(bpm) || 0);
  const D = Math.max(1, Number(den) || 4);
  return (60 / B) * (4 / D);
}

/** Convert beats → seconds for given BPM + denominator. */
export function beatsToSeconds(beats: number, bpm: number, den: number): number {
  return Math.max(0, beats) * secondsPerBeat(bpm, den);
}

/** Convert bars → beats for given TS numerator. */
export function barsToBeats(bars: number, num: number): number {
  return Math.max(0, bars) * Math.max(1, num);
}

/* ---------------- Musical durations ---------------- */

export type NoteValue =
  | "whole"
  | "dotted-half"
  | "half"
  | "dotted-quarter"
  | "triplet-quarter"
  | "quarter"
  | "dotted-eighth"
  | "triplet-eighth"
  | "eighth"
  | "dotted-sixteenth"
  | "triplet-sixteenth"
  | "sixteenth"
  | "thirtysecond";

/** Note value length in quarter-note units (quarter=1). */
export function noteValueInQuarterUnits(v: NoteValue): number {
  switch (v) {
    case "whole": return 4;
    case "dotted-half": return 3;
    case "half": return 2;
    case "dotted-quarter": return 1.5;
    case "triplet-quarter": return 2 / 3;
    case "quarter": return 1;
    case "dotted-eighth": return 0.75;
    case "triplet-eighth": return 1 / 3;
    case "eighth": return 0.5;
    case "dotted-sixteenth": return 0.375;
    case "triplet-sixteenth": return 1 / 6;
    case "sixteenth": return 0.25;
    case "thirtysecond": return 0.125;
    default: return 0.5;
  }
}

/** Convert a NoteValue to *beats* where a beat == denominator note. */
export function noteValueToBeats(v: NoteValue, den: number): number {
  const q = noteValueInQuarterUnits(v);
  return q * (den / 4); // quarter = den/4 beats
}

/** Convert a NoteValue to seconds using BPM and time signature denominator. */
export function noteValueToSeconds(v: NoteValue, bpm: number, den: number): number {
  return beatsToSeconds(noteValueToBeats(v, den), bpm, den);
}
