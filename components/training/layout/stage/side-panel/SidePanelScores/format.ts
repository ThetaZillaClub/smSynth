import type { NoteValue } from "@/utils/time/tempo";
import { QF } from "@/utils/phrase/rhythmGrid";

/**
 * Best-effort mapping from seconds to a readable note value label.
 * We search across common values and pick the smallest error.
 */
export function secondsToNoteLabel(sec: number, bpm: number, den: number): string {
  if (!isFinite(sec) || sec <= 0 || !isFinite(bpm) || bpm <= 0 || !isFinite(den) || den <= 0) {
    return `${Number(sec).toFixed(2)}s`;
  }

  // one quarter note duration in seconds at the provided time signature denominator
  const beatSec = (60 / bpm) * (4 / den);

  // Typed as tuple [NoteValue, label] — fixes TS2488
  const CANDIDATES: ReadonlyArray<readonly [NoteValue, string]> = [
    ["whole", "whole"],
    ["dotted-half", "dotted half"],
    ["half", "half"],
    ["dotted-quarter", "dotted quarter"],
    ["triplet-quarter", "triplet quarter"],
    ["quarter", "quarter"],
    ["dotted-eighth", "dotted eighth"],
    ["triplet-eighth", "triplet eighth"],
    ["eighth", "eighth"],
    ["dotted-sixteenth", "dotted sixteenth"],
    ["triplet-sixteenth", "triplet sixteenth"],
    ["sixteenth", "sixteenth"],
    ["thirtysecond", "thirty-second"],
  ] as const;

  let bestLabel = "";
  let bestErr = Number.POSITIVE_INFINITY;

  for (const [v, label] of CANDIDATES) {
    const frac = QF[v]; // { n, d }
    const ideal = (frac.n / frac.d) * beatSec;
    const err = Math.abs(ideal - sec);
    if (err < bestErr) {
      bestErr = err;
      bestLabel = label;
    }
  }

  if (!isFinite(bestErr)) return `${sec.toFixed(2)}s`;

  // Cap “match” at 99% so we don’t overpromise exactness
  const pct =
    sec > 0
      ? Math.max(0, Math.min(99, Math.round(100 * (1 - bestErr / sec))))
      : 0;

  return `${bestLabel} (~${pct}% match)`;
}

export function intervalLabel(semitones: number): string {
  const s = Math.abs(Math.round(semitones));
  switch (s) {
    case 0: return "Perfect Unison";
    case 1: return "Minor 2nd";
    case 2: return "Major 2nd";
    case 3: return "Minor 3rd";
    case 4: return "Major 3rd";
    case 5: return "Perfect 4th";
    case 6: return "Tritone";
    case 7: return "Perfect 5th";
    case 8: return "Minor 6th";
    case 9: return "Major 6th";
    case 10: return "Minor 7th";
    case 11: return "Major 7th";
    case 12: return "Perfect Octave";
    default: return `${s} semitones`;
  }
}
