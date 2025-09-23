// utils/stage/axes.ts
// Stage overlay helpers: time/pitch → screen mapping and shared types.
// NOTE: this is UI/screen "scaling" — not musical scales (see utils/phrase/scales.ts).

// ---- Types (shared across stage overlays) ----
export type Note = { midi: number; startSec: number; durSec: number };
export type Phrase = { durationSec: number; notes: Note[] };

// ---- Math helpers ----
export const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Return an inclusive MIDI range around a phrase, padded by `pad` semitones (defaults to 2). */
export function getMidiRange(
  phrase: Phrase,
  pad: number = 2
): { minMidi: number; maxMidi: number } {
  let mn = Infinity;
  let mx = -Infinity;
  for (const n of phrase.notes) {
    mn = Math.min(mn, n.midi);
    mx = Math.max(mx, n.midi);
  }
  if (!isFinite(mn) || !isFinite(mx)) {
    mn = 60;
    mx = 72;
  }
  return { minMidi: Math.floor(mn - pad), maxMidi: Math.ceil(mx + pad) };
}

/** Map absolute time (seconds) → X pixel within width W (0..W) given total duration. */
export const timeToX = (t: number, W: number, durationSec: number) => (t / durationSec) * W;

/** Grid line Y for an exact MIDI boundary (integer steps) within min..max MIDI view. */
export function midiToY(midi: number, H: number, minMidi: number, maxMidi: number) {
  const span = Math.max(1e-6, maxMidi - minMidi);
  const y = H - ((midi - minMidi) / span) * H;
  return clamp(y, 0, H);
}

/** Center Y of a semitone cell (rectangles sit between lines). */
export function midiToYCenter(midi: number, H: number, minMidi: number, maxMidi: number) {
  return midiToY(midi + 0.5, H, minMidi, maxMidi);
}

/** Full cell rect for an integer MIDI (top & height fill between lines). */
export function midiCellRect(midi: number, H: number, minMidi: number, maxMidi: number) {
  const yTop = midiToY(midi + 1, H, minMidi, maxMidi);
  const yBot = midiToY(midi, H, minMidi, maxMidi);
  return { y: Math.min(yTop, yBot), h: Math.abs(yBot - yTop) };
}
