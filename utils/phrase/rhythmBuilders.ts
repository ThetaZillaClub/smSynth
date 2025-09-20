// utils/phrase/rhythmBuilders.ts
import type { RhythmEvent } from "./phraseTypes";
import type { NoteValue } from "@/utils/time/tempo";
import { makeRng, choose } from "./random";
import {
  beatsFrac,
  makeBeatGridDen,
  unitsBucket,
  toUnits,
  makeReach,
  randomExactUnits,
  FILLERS,
} from "./rhythmGrid";
import { lcm } from "./rational";

/** Build a rhythm of identical note values. */
export function buildEqualRhythm(note: NoteValue, length = 8): RhythmEvent[] {
  return Array.from({ length }, () => ({ type: "note", value: note }));
}

/** Random rhythm over quarter/eighth/sixteenth; ~20% rests by default. */
export function buildRandomRhythmBasic(opts: {
  length?: number;
  allowRests?: boolean;
  seed?: number;
}): RhythmEvent[] {
  const length = Math.max(1, opts.length ?? 8);
  const rnd = makeRng(opts.seed ?? 0xA5F3D7);
  const pool: NoteValue[] = ["quarter", "eighth", "sixteenth"];
  const out: RhythmEvent[] = [];
  for (let i = 0; i < length; i++) {
    const val = choose(pool, rnd);
    const isRest = opts.allowRests !== false && rnd() < 0.2;
    out.push({ type: isRest ? "rest" : "note", value: val });
  }
  return out;
}

/** Random rhythm with syncopation; ~15% rests by default. */
export function buildRandomRhythmSyncopated(opts: {
  length?: number;
  allowRests?: boolean;
  seed?: number;
}): RhythmEvent[] {
  const length = Math.max(1, opts.length ?? 8);
  const rnd = makeRng(opts.seed ?? 0x1F2E3D);
  const pool: NoteValue[] = ["dotted-eighth", "eighth", "triplet-eighth", "sixteenth"];
  const out: RhythmEvent[] = [];
  for (let i = 0; i < length; i++) {
    const val = choose(pool, rnd);
    const isRest = opts.allowRests !== false && rnd() < 0.15;
    out.push({ type: isRest ? "rest" : "note", value: val });
  }
  return out;
}

export type TwoBarOpts = {
  bpm: number; // kept for API symmetry
  den: number;
  tsNum: number;
  available: NoteValue[];
  restProb?: number;
  allowRests?: boolean;
  seed?: number;
  noteQuota?: number; // ignored for parity
  bars?: number;      // default 2
};

/** Build a rhythm that fills an exact number of whole bars from a whitelist of note values. */
export function buildTwoBarRhythm(opts: TwoBarOpts): RhythmEvent[] {
  const {
    den, tsNum,
    available,
    restProb = 0.3,
    allowRests = true,
    seed = 0xA5F3D7,
    bars = 2,
  } = opts;

  const rnd = makeRng(seed);

  let gridDen = makeBeatGridDen(available, den);
  let bucket = unitsBucket(available, den, gridDen);
  let coins = Array.from(bucket.keys()).sort((a, b) => a - b);

  let target = tsNum * gridDen;

  if (!makeReach(coins, target)[target]) {
    for (const f of FILLERS) gridDen = lcm(gridDen, beatsFrac(f, den).d);
    bucket = unitsBucket([...available, ...FILLERS], den, gridDen);
    coins = Array.from(bucket.keys()).sort((a, b) => a - b);
    target = tsNum * gridDen;
  }

  const makeBarUnits = () => {
    const u = randomExactUnits(target, coins, rnd);
    return u.length ? u : Array.from({ length: tsNum }, () => toUnits("quarter", den, gridDen));
  };

  const outVals: NoteValue[] = [];
  for (let b = 0; b < Math.max(1, Math.floor(bars)); b++) {
    const units = makeBarUnits();
    for (const u of units) {
      const vals = bucket.get(u)!;
      outVals.push(vals[Math.floor(rnd() * vals.length)]);
    }
  }

  const out: RhythmEvent[] = outVals.map((v) => {
    let type: RhythmEvent["type"] = "note";
    if (allowRests) type = rnd() < restProb ? "rest" : "note";
    return { type, value: v };
  });

  if (allowRests) {
    const unitsPerBar = tsNum * gridDen;
    let acc = 0;
    let hasNote = false;
    for (let i = 0; i < out.length && acc < unitsPerBar; i++) {
      acc += toUnits(out[i].value, den, gridDen);
      if (out[i].type === "note") hasNote = true;
    }
    if (!hasNote && out.length) out[0] = { ...out[0], type: "note" };
  }

  return out;
}

export type QuotaOpts = {
  bpm: number; // kept for API symmetry
  den: number;
  tsNum: number;
  available: NoteValue[];
  restProb?: number;
  allowRests?: boolean;
  seed?: number;
  /** How many NOTE events we need in total (rests excluded). */
  noteQuota: number;
};

/** Build as many whole bars as needed to supply exactly `noteQuota` NOTE slots. */
export function buildBarsRhythmForQuota(opts: QuotaOpts): RhythmEvent[] {
  const {
    den, tsNum,
    available,
    restProb = 0.3,
    allowRests = true,
    seed = 0xA5F3D7,
    noteQuota,
  } = opts;

  const rnd = makeRng(seed);

  let gridDen = makeBeatGridDen(available, den);
  let bucket = unitsBucket(available, den, gridDen);
  let coins = Array.from(bucket.keys()).sort((a, b) => a - b);
  const targetUnitsPerBar_initial = tsNum * gridDen;

  if (!makeReach(coins, targetUnitsPerBar_initial)[targetUnitsPerBar_initial]) {
    for (const f of FILLERS) {
      gridDen = lcm(gridDen, beatsFrac(f, den).d);
    }
    bucket = unitsBucket([...available, ...FILLERS], den, gridDen);
    coins = Array.from(bucket.keys()).sort((a, b) => a - b);
  }

  const targetUnitsPerBar = tsNum * gridDen;

  const makeBarVals = () => {
    const units = randomExactUnits(targetUnitsPerBar, coins, rnd);
    const vals: NoteValue[] = units.map((u) => {
      const vs = bucket.get(u)!;
      return vs[Math.floor(rnd() * vs.length)];
    });
    return vals;
  };

  const out: RhythmEvent[] = [];
  let notesSoFar = 0;

  bars_loop:
  while (notesSoFar < noteQuota) {
    const vals = makeBarVals();
    let barHasNote = false;

    for (const v of vals) {
      let type: RhythmEvent["type"] = "note";
      if (allowRests) {
        if (notesSoFar >= noteQuota) type = "rest";
        else type = rnd() < restProb ? "rest" : "note";
      }
      if (type === "note") { notesSoFar++; barHasNote = true; }
      out.push({ type, value: v });
      if (!allowRests && notesSoFar >= noteQuota) break bars_loop;
    }

    if (allowRests && out.length && out.every((e, i) => i < vals.length ? e.type === "rest" : true)) {
      out[0] = { ...out[0], type: "note" };
      notesSoFar = Math.max(1, notesSoFar);
      barHasNote = true;
    }

    if (allowRests && !barHasNote) {
      const idx0 = out.length - vals.length;
      out[idx0] = { ...out[idx0], type: "note" };
      notesSoFar++;
    }
  }

  const noteCount = out.filter((e) => e.type === "note").length;
  if (allowRests && noteCount > noteQuota) {
    let extra = noteCount - noteQuota;
    for (let i = out.length - 1; i >= 0 && extra > 0; i--) {
      if (out[i].type === "note") { out[i] = { ...out[i], type: "rest" }; extra--; }
    }
  }

  return out;
}
