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

/**
 * Flexible lead-in parser:
 *  - "1bar", "2bars"        → bars * tsNum beats
 *  - "3" or "3.5"           → that many beats
 *  - otherwise               → default 1 bar
 */
export function computeLeadBeats(raw: string | null | undefined, tsNum: number): number {
  const s = (raw ?? "").trim().toLowerCase();
  if (!s) return Math.max(1, tsNum);
  const barMatch = s.match(/^(\d+(?:\.\d+)?)\s*bars?$/);
  if (barMatch) {
    const bars = Number(barMatch[1]);
    return barsToBeats(Number.isFinite(bars) ? bars : 1, tsNum);
  }
  const beats = Number(s);
  if (Number.isFinite(beats) && beats >= 0) return beats;
  if (s === "bar" || s === "bars") return Math.max(1, tsNum);
  return Math.max(1, tsNum);
}
