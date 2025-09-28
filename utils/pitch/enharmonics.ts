import { midiToNoteName, type OctaveAnchor } from "@/utils/pitch/pitchMath";
import type { ScaleName } from "@/utils/phrase/scales";

/** Relative-major pivot → choose sharps/flats by key signature side. */
function relativeMajorPc(tonicPc: number, scale: ScaleName): number {
  const off =
    scale === "major"            ? 0  :
    scale === "dorian"           ? 2  :
    scale === "phrygian"         ? 4  :
    scale === "lydian"           ? 5  :
    scale === "mixolydian"       ? 7  :
    scale === "natural_minor"    ? 9  : // Aeolian
    scale === "harmonic_minor"   ? 9  :
    scale === "melodic_minor"    ? 9  :
    scale === "locrian"          ? 11 :
    scale === "major_pentatonic" ? 0  :
    scale === "minor_pentatonic" ? 9  :
    /* chromatic */                0;
  return ((tonicPc - off) % 12 + 12) % 12;
}

const FLAT_SIDE = new Set([5, 10, 3, 8, 1, 6]); // F, Bb, Eb, Ab, Db, Gb

/** Should this key/scale be spelled with sharps? */
export function useSharpsForKey(tonicPc: number, scale: ScaleName): boolean {
  return !FLAT_SIDE.has(relativeMajorPc(tonicPc, scale));
}

/** Pitch-class label (C..B with #/b) per key/scale. */
export function pcLabelForKey(pcAbs: number, tonicPc: number, scale: ScaleName): string {
  const useSharps = useSharpsForKey(tonicPc, scale);
  const SHARP = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];
  const FLAT  = ["C","Db","D","Eb","E","F","Gb","G","Ab","A","Bb","B"];
  const pc = ((pcAbs % 12) + 12) % 12;
  return (useSharps ? SHARP : FLAT)[pc];
}

/** MIDI name+octave per key/scale (respects your octaveAnchor). */
export function midiLabelForKey(
  midi: number,
  tonicPc: number,
  scale: ScaleName,
  octaveAnchor: OctaveAnchor = "C"
): { name: string; octave: number; text: string } {
  const useSharps = useSharpsForKey(tonicPc, scale);
  const { name, octave } = midiToNoteName(midi, { useSharps, octaveAnchor });
  return { name, octave, text: `${name}${octave}` };
}
