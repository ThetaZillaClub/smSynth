// utils/phrase/rhythmBarFit.ts
import type { RhythmEvent, Rat } from "./phraseTypes";
import type { NoteValue } from "@/utils/time/tempo";
import { addRat, reduce, lcm } from "./rational";
import {
  beatsFrac,
  makeBeatGridDen,
  unitsBucket,
  toUnits,
  makeReach,
  randomExactUnits,
  FILLERS,
} from "./rhythmGrid";
import { makeRng } from "./random";

/** Sum *exact* beats for a rhythm, as a reduced rational number. */
export function totalBeatsRat(rhythm: RhythmEvent[], den: number): Rat {
  let r: Rat = { n: 0, d: 1 };
  for (const ev of rhythm) r = addRat(r, beatsFrac(ev.value, den));
  return reduce(r);
}

/** Number of bars (ceil to whole bars) a rhythm occupies. */
export function rhythmBars(rhythm: RhythmEvent[], den: number, tsNum: number): number {
  const { n, d } = totalBeatsRat(rhythm, den);
  const barsFloat = (n / d) / Math.max(1, tsNum);
  return Math.max(1, Math.ceil(barsFloat - 1e-9));
}

export type FitRhythmOpts = {
  rhythm: RhythmEvent[];
  bars: number;
  den: number;
  tsNum: number;
  availableForFiller?: NoteValue[];
  allowRests?: boolean;  // default true
  restProb?: number;     // default 0.3
  seed?: number;         // for random filler choices
};

/**
 * Fit a rhythm to exactly N whole bars:
 *  - If rhythm is longer → truncate and fill the last partial unit exactly.
 *  - If rhythm is shorter → append random filler (notes/rests) to finish the last bar exactly.
 *  - Guarantees at least one NOTE in the first bar when rests are allowed.
 */
export function fitRhythmToBars(opts: FitRhythmOpts): RhythmEvent[] {
  const {
    rhythm,
    bars,
    den,
    tsNum,
    availableForFiller,
    allowRests = true,
    restProb = 0.3,
    seed = 0xC0FFEE,
  } = opts;

  const targetBeats = reduce({ n: Math.max(1, bars) * tsNum, d: 1 });

  // Determine an integer grid from the values we expect to use (input + fillers).
  const baseVals = Array.from(
    new Set<NoteValue>([
      ...(rhythm?.map((r) => r.value) ?? []),
      ...((availableForFiller && availableForFiller.length ? availableForFiller : ["quarter", "eighth", "sixteenth"]) as NoteValue[]),
    ])
  );
  let gridDen = makeBeatGridDen(baseVals, den);
  let bucket = unitsBucket(baseVals, den, gridDen);
  let coins = Array.from(bucket.keys()).sort((a, b) => a - b);

  // Expand grid with tiny fillers if the target beat count isn't reachable.
  const targetUnitsInitial = (targetBeats.n * gridDen) / targetBeats.d;
  if (!makeReach(coins, targetUnitsInitial)[targetUnitsInitial]) {
    for (const f of FILLERS) gridDen = lcm(gridDen, beatsFrac(f, den).d);
    const more = Array.from(new Set<NoteValue>([...baseVals, ...FILLERS]));
    bucket = unitsBucket(more, den, gridDen);
    coins = Array.from(bucket.keys()).sort((a, b) => a - b);
  }
  const targetUnits = (targetBeats.n * gridDen) / targetBeats.d;

  const rnd = makeRng(seed);
  const out: RhythmEvent[] = [];

  let usedUnits = 0;
  const push = (type: "note" | "rest", v: NoteValue) => {
    out.push({ type, value: v });
    usedUnits += toUnits(v, den, gridDen);
  };

  // Copy as much of the input as fits; truncate the first event that would overflow.
  for (const ev of rhythm) {
    const u = toUnits(ev.value, den, gridDen);
    if (usedUnits + u < targetUnits) {
      push(ev.type, ev.value);
    } else if (usedUnits + u === targetUnits) {
      push(ev.type, ev.value);
      break;
    } else {
      const rem = targetUnits - usedUnits;
      if (rem > 0) {
        const parts = randomExactUnits(rem, coins, rnd);
        for (const p of parts) {
          const vals = bucket.get(p)!;
          const chosen = vals[Math.floor(rnd() * vals.length)];
          const t = allowRests && rnd() < restProb ? "rest" : "note";
          push(t, chosen);
        }
      }
      break;
    }
  }

  // If we ended short, fill the rest with random filler.
  if (usedUnits < targetUnits) {
    const rem = targetUnits - usedUnits;
    const parts = randomExactUnits(rem, coins, rnd);
    for (const p of parts) {
      const vals = bucket.get(p)!;
      const chosen = vals[Math.floor(rnd() * vals.length)];
      const t = allowRests && rnd() < restProb ? "rest" : "note";
      push(t, chosen);
    }
  }

  // Ensure first bar has at least one NOTE if rests are allowed.
  if (allowRests) {
    const barUnits = tsNum * gridDen;
    let acc = 0;
    let hasNote = false;
    for (let i = 0; i < out.length && acc < barUnits; i++) {
      acc += toUnits(out[i].value, den, gridDen);
      if (out[i].type === "note") hasNote = true;
      if (acc >= barUnits) break;
    }
    if (!hasNote && out.length) {
      const first = out[0];
      out[0] = { ...first, type: "note" };
    }
  }

  return out;
}
