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

/**
 * Build a rhythm that fills an exact number of whole bars from a whitelist of note values.
 * Hard guarantees:
 *  - First slot of every bar is a NOTE (prevents blank bars).
 *  - Gentle “soft start” on rests: early notes are biased toward notes.
 */
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

  const out: RhythmEvent[] = [];
  const barsInt = Math.max(1, Math.floor(bars));
  let notesTotal = 0;

  for (let b = 0; b < barsInt; b++) {
    const units = makeBarUnits();
    let notesThisBar = 0;

    for (const u of units) {
      const vals = bucket.get(u)!;
      const v = vals[Math.floor(rnd() * vals.length)];

      // --- REST POLICY ---
      // 1) First slot in each bar must be a NOTE.
      // 2) “Soft start”: in the very beginning (first ~2 notes overall),
      //    tone down rests to avoid an all-rest opening feel.
      // 3) If still somehow no note yet in this bar, keep biasing toward a note.
      let type: RhythmEvent["type"] = "note";
      if (allowRests) {
        const atBarStart = notesThisBar === 0;
        const softStart = notesTotal < 2;                    // first couple of notes overall
        const rampedRestProb = softStart ? restProb * 0.4    // soften rests at the very start
                                         : (notesThisBar === 0 ? Math.min(restProb, 0.25) : restProb);

        type = atBarStart ? "note" : (rnd() < rampedRestProb ? "rest" : "note");
      }

      if (type === "note") { notesThisBar++; notesTotal++; }
      out.push({ type, value: v });
    }

    // Safety: if an edge case slipped through, flip bar’s first event to a NOTE.
    if (allowRests && notesThisBar === 0) {
      const barLen = units.length;
      const idx0 = out.length - barLen;
      if (idx0 >= 0 && idx0 < out.length) {
        out[idx0] = { ...out[idx0], type: "note" };
        notesThisBar = 1;
        notesTotal++;
      }
    }
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

/**
 * Build as many whole bars as needed to supply exactly `noteQuota` NOTE slots.
 * Adjustments:
 *  - First slot of each bar is forced NOTE (prevents all-rest bars).
 *  - Soft-start rest probability for the first few notes to avoid blank openings.
 */
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

    for (let i = 0; i < vals.length; i++) {
      const v = vals[i];

      // --- REST POLICY (quota variant) ---
      // 1) If we already met the quota, remaining are rests.
      // 2) Force first slot of the bar to NOTE.
      // 3) Soft start: reduce early rest probability until a couple of notes appear.
      let type: RhythmEvent["type"] = "note";
      if (allowRests) {
        const atBarStart = i === 0 || !barHasNote;
        if (notesSoFar >= noteQuota) {
          type = "rest";
        } else if (atBarStart) {
          type = "note";
        } else {
          const softStart = notesSoFar < Math.max(2, Math.ceil(noteQuota * 0.25));
          const rampedRestProb = softStart ? restProb * 0.5 : restProb;
          type = rnd() < rampedRestProb ? "rest" : "note";
        }
      }

      if (type === "note") { notesSoFar++; barHasNote = true; }
      out.push({ type, value: v });

      if (!allowRests && notesSoFar >= noteQuota) break bars_loop;
    }

    // Safety: ensure at least one NOTE in the bar
    if (allowRests && !barHasNote && vals.length) {
      const idx0 = out.length - vals.length;
      out[idx0] = { ...out[idx0], type: "note" };
      notesSoFar = Math.max(1, notesSoFar);
    }
  }

  // If we overshot (shouldn't normally), demote trailing notes to rests.
  const noteCount = out.filter((e) => e.type === "note").length;
  if (allowRests && noteCount > noteQuota) {
    let extra = noteCount - noteQuota;
    for (let i = out.length - 1; i >= 0 && extra > 0; i--) {
      if (out[i].type === "note") { out[i] = { ...out[i], type: "rest" }; extra--; }
    }
  }

  return out;
}
