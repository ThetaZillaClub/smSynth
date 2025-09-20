// utils/phrase/rhythmGrid.ts
import type { NoteValue } from "@/utils/time/tempo";
import type { Rat } from "./phraseTypes";
import { lcm, reduce } from "./rational";

/** Quarter-note fractions (exact) for every NoteValue. (quarter = 1) */
export const QF: Record<NoteValue, Rat> = {
  whole: { n: 4, d: 1 },
  "dotted-half": { n: 3, d: 1 },
  half: { n: 2, d: 1 },
  "dotted-quarter": { n: 3, d: 2 },
  "triplet-quarter": { n: 2, d: 3 },
  quarter: { n: 1, d: 1 },
  "dotted-eighth": { n: 3, d: 4 },
  "triplet-eighth": { n: 1, d: 3 },
  eighth: { n: 1, d: 2 },
  "dotted-sixteenth": { n: 3, d: 8 },
  "triplet-sixteenth": { n: 1, d: 6 },
  sixteenth: { n: 1, d: 4 },
  thirtysecond: { n: 1, d: 8 },
};

/**
 * Exact beats (relative to denominator beat) for a NoteValue.
 * @param v Note value
 * @param den Time signature denominator (4 = quarter beat)
 */
export function beatsFrac(v: NoteValue, den: number): Rat {
  const { n, d } = QF[v];
  return reduce({ n: n * den, d: d * 4 });
}

/** Per-beat integer grid = LCM of denominators from available values. */
export function makeBeatGridDen(available: NoteValue[], den: number): number {
  let g = 1;
  for (const v of available) {
    const { d } = beatsFrac(v, den);
    g = lcm(g, d);
  }
  return g;
}

/** Convert a NoteValue to integer units given per-beat grid denominator. */
export function toUnits(v: NoteValue, den: number, gridDen: number): number {
  const { n, d } = beatsFrac(v, den);
  return (n * gridDen) / d; // integer because gridDen is LCM of all d's
}

/** Build a lookup: units → list of NoteValues with that exact size (for variety). */
export function unitsBucket(
  available: NoteValue[],
  den: number,
  gridDen: number
): Map<number, NoteValue[]> {
  const m = new Map<number, NoteValue[]>();
  for (const v of available) {
    const u = toUnits(v, den, gridDen);
    if (!m.has(u)) m.set(u, []);
    const arr = m.get(u)!;
    if (!arr.includes(v)) arr.push(v);
  }
  return m;
}

/** Unbounded coin-change reachability for “can we finish this remainder exactly?”. */
export function makeReach(coins: number[], target: number): boolean[] {
  const reach = Array<boolean>(target + 1).fill(false);
  reach[0] = true;
  for (let s = 1; s <= target; s++) {
    for (const c of coins) {
      if (c <= s && reach[s - c]) { reach[s] = true; break; }
    }
  }
  return reach;
}

/** Random constructive fill of `target` units using `coins`, guaranteed to end exactly. */
export function randomExactUnits(target: number, coins: number[], rnd: () => number): number[] {
  const reach = makeReach(coins, target);
  if (!reach[target]) return [];
  const parts: number[] = [];
  let rem = target;
  const sorted = coins.slice().sort((a, b) => a - b);
  while (rem > 0) {
    const feas = sorted.filter((c) => c <= rem && reach[rem - c]);
    const pick = feas[Math.floor(Math.pow(rnd(), 0.7) * feas.length)];
    parts.push(pick);
    rem -= pick;
  }
  return parts;
}

/** Last-resort tiny fillers to close a bar if the user's pool can't pack it. */
export const FILLERS: NoteValue[] = [
  "triplet-sixteenth",
  "sixteenth",
  "triplet-eighth",
  "eighth",
];
