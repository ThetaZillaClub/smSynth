// utils/pitch/pitchMath.ts
const A4_MIDI = 69;
const SEMI = 12;

const NAMES_SHARP = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];
const NAMES_FLAT  = ["C","Db","D","Eb","E","F","Gb","G","Ab","A","Bb","B"];

export function hzToMidi(hz: number, a4Hz = 440): number {
  if (!isFinite(hz) || hz <= 0) return NaN;
  return A4_MIDI + SEMI * Math.log2(hz / a4Hz);
}

export function midiToHz(midi: number, a4Hz = 440): number {
  return a4Hz * Math.pow(2, (midi - A4_MIDI) / SEMI);
}

export function centsBetweenHz(a: number, b: number): number {
  if (a <= 0 || b <= 0) return 0;
  return 1200 * Math.log2(a / b);
}

export function midiToNoteName(
  midi: number,
  { useSharps = true }: { useSharps?: boolean } = {}
): { name: string; octave: number } {
  const names = useSharps ? NAMES_SHARP : NAMES_FLAT;
  const m = Math.round(midi);
  const pc = ((m % 12) + 12) % 12;
  const name = names[pc];
  const octave = Math.floor(m / 12) - 1;
  return { name, octave };
}

export function hzToNoteName(
  hz: number,
  a4Hz = 440,
  opts?: { useSharps?: boolean }
): { name: string; octave: number; midi: number; cents: number } {
  const m = hzToMidi(hz, a4Hz);
  const nearest = Math.round(m);
  const cents = Math.round(100 * (m - nearest));
  const { name, octave } = midiToNoteName(nearest, opts);
  return { name, octave, midi: nearest, cents };
}
