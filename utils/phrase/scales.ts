// utils/phrase/scales.ts
export type ScaleName =
  | "major"
  | "natural_minor"
  | "harmonic_minor"
  | "melodic_minor"
  | "dorian"
  | "phrygian"
  | "lydian"
  | "mixolydian"
  | "locrian"
  | "major_pentatonic"
  | "minor_pentatonic"
  | "chromatic";

/** semitone offsets from tonic within one octave */
export function scaleSemitones(name: ScaleName): number[] {
  switch (name) {
    case "major": return [0,2,4,5,7,9,11];
    case "natural_minor": return [0,2,3,5,7,8,10];
    case "harmonic_minor": return [0,2,3,5,7,8,11];
    case "melodic_minor": return [0,2,3,5,7,9,11];
    case "dorian": return [0,2,3,5,7,9,10];
    case "phrygian": return [0,1,3,5,7,8,10];
    case "lydian": return [0,2,4,6,7,9,11];
    case "mixolydian": return [0,2,4,5,7,9,10];
    case "locrian": return [0,1,3,5,6,8,10];
    case "major_pentatonic": return [0,2,4,7,9];
    case "minor_pentatonic": return [0,3,5,7,10];
    case "chromatic": return [0,1,2,3,4,5,6,7,8,9,10,11];
  }
}

/** membership test on pitch-class (0..11) relative to tonic */
export function isInScale(pcAbs: number, tonicPc: number, name: ScaleName): boolean {
  const rel = ((pcAbs - tonicPc) % 12 + 12) % 12;
  return scaleSemitones(name).includes(rel);
}

/** get "degree index" 0..k-1 for a pitch-class within the scale (or -1 if not in scale) */
export function degreeIndex(pcAbs: number, tonicPc: number, name: ScaleName): number {
  const rel = ((pcAbs - tonicPc) % 12 + 12) % 12;
  return scaleSemitones(name).indexOf(rel);
}
