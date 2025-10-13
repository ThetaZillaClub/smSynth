import { midiToNoteName } from '@/utils/pitch/pitchMath';

export const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
export const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
export const ease = (t: number) => 1 - Math.pow(1 - Math.max(0, Math.min(1, t)), 3);

export const NOTE = (m: number) => {
  const n = midiToNoteName(m, { useSharps: true });
  return `${n.name}${n.octave}`;
};
