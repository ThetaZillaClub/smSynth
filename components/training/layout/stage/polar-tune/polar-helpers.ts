// components/training/layout/stage/polar-tune/polar-helpers.ts
export function hzToMidi(hz: number, a4Hz = 440): number {
  return 69 + 12 * Math.log2(hz / a4Hz);
}
/** continuous relative pitch class in [0,12) where 0 == tonicPc */
export function relPcFloat(midi: number, tonicPc: number): number {
  const pcFloat = ((midi % 12) + 12) % 12;
  return ((pcFloat - (((tonicPc % 12) + 12) % 12)) + 12) % 12;
}
/**
 * Angle for a given relative pitch class, **centered** in its 12-step wedge.
 * We shift by +0.5 so an exact semitone (integer relPc) lands in the middle
 * of its cell rather than on the boundary.
 */
export const angleForRel = (relPc: number) =>
  (((relPc + 0.5) % 12) * (2 * Math.PI / 12)) - Math.PI / 2; // wedge center, top near tonic 0/12
export const clamp = (v: number, a: number, b: number) =>
  Math.max(a, Math.min(b, v));