// math
export const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export function getMidiRange(
  phrase: { notes: { midi: number }[] },
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

export const timeToX = (t: number, W: number, durationSec: number) => (t / durationSec) * W;

/** Grid line position for an exact MIDI boundary (integer steps). */
export function midiToY(midi: number, H: number, minMidi: number, maxMidi: number) {
  const span = Math.max(1e-6, maxMidi - minMidi);
  const y = H - ((midi - minMidi) / span) * H;
  return clamp(y, 0, H);
}

/** Center of a semitone cell (so rectangles sit BETWEEN lines). */
export function midiToYCenter(midi: number, H: number, minMidi: number, maxMidi: number) {
  return midiToY(midi + 0.5, H, minMidi, maxMidi);
}

/** Full cell rect for a given integer MIDI (top & height fill between lines). */
export function midiCellRect(midi: number, H: number, minMidi: number, maxMidi: number) {
  const yTop = midiToY(midi + 1, H, minMidi, maxMidi);
  const yBot = midiToY(midi, H, minMidi, maxMidi);
  return { y: Math.min(yTop, yBot), h: Math.abs(yBot - yTop) };
}

// theme (aligned to site colors)
export const PR_COLORS = {
  bg: "#ebebeb",
  gridMinor: "rgba(15,15,15,0.08)",
  gridMajor: "rgba(15,15,15,0.18)",
  label: "rgba(15,15,15,0.65)",

  noteFill: "#22c55e",                // emerald-500
  noteStroke: "rgba(21,128,61,0.65)", // emerald-700 @ 65%

  timeline: "rgba(15,15,15,0.18)",
  trace: "#0f0f0f",                   // (kept if you decide to re-enable)
  playhead: "rgba(15,15,15,0.50)",    // (not used now)
  dotFill: "#0f0f0f",
  dotStroke: "rgba(255,255,255,0.85)"
} as const;
