const A4_MIDI = 69;
const SEMI = 12;

const NAMES_SHARP = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];
const NAMES_FLAT  = ["C","Db","D","Eb","E","F","Gb","G","Ab","A","Bb","B"];

export type OctaveAnchor = "C" | "A";

export function hzToMidi(hz: number, a4Hz = 440): number {
  if (!isFinite(hz) || hz <= 0) return NaN;
  return A4_MIDI + SEMI * Math.log2(hz / a4Hz);
}

export function midiToHz(midi: number, a4Hz = 440): number {
  return a4Hz * Math.pow(2, (midi - A4_MIDI) / SEMI);
}
export function centsBetweenHz(a: number, b: number): number {
  if (!isFinite(a) || !isFinite(b) || a <= 0 || b <= 0) return 0;
  return 1200 * Math.log2(a / b);
}

export function midiToNoteName(
  midi: number,
  {
    useSharps = true,
    octaveAnchor = "C",
  }: { useSharps?: boolean; octaveAnchor?: OctaveAnchor } = {}
): { name: string; octave: number } {
  const names = useSharps ? NAMES_SHARP : NAMES_FLAT;
  const m = Math.round(midi);
  const pc = ((m % 12) + 12) % 12;             // 0=C ... 11=B
  const name = names[pc];

  // C-anchored scientific: C4 = 60 → floor(60/12)-1 = 4
  const baseOct = Math.floor(m / 12) - 1;

  // A-anchored: octave increments at A (pc >= 9). For C..G# (pc < 9) subtract 1.
  const octave =
    octaveAnchor === "A" ? baseOct - (pc < 9 ? 1 : 0) : baseOct;

  return { name, octave };
}

export function hzToNoteName(
  hz: number,
  a4Hz = 440,
  opts?: { useSharps?: boolean; octaveAnchor?: OctaveAnchor }
): { name: string; octave: number; midi: number; cents: number } {
  const m = hzToMidi(hz, a4Hz);
  const nearest = Math.round(m);
  const cents = Math.round(100 * (m - nearest));
  const { name, octave } = midiToNoteName(nearest, opts);
  return { name, octave, midi: nearest, cents };
}
