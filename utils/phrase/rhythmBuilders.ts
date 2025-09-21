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

/* ------------------------------------------------------------------
   Triplet normalizer (bar-local): ensure triplets appear only in 3s.
   We work at the integer "units" level, then map back to NoteValues.
------------------------------------------------------------------- */

function normalizeTripletsInUnits(opts: {
  units: number[];                       // bar partition (integer units)
  bucket: Map<number, NoteValue[]>;      // units -> candidate NoteValues
  den: number;
  gridDen: number;
  rnd: () => number;
}) {
  const { units, bucket, den, gridDen, rnd } = opts;

  // Compute unit sizes we care about (only if actually representable in the bucket)
  const u = (v: NoteValue) => toUnits(v, den, gridDen);

  const has = (uv: number, label: NoteValue) =>
    bucket.has(uv) && (bucket.get(uv) || []).includes(label);

  const U_TE = u("triplet-eighth");
  const U_TQ = u("triplet-quarter");
  const U_TS = u("triplet-sixteenth");

  const allowTE = has(U_TE, "triplet-eighth");
  const allowTQ = has(U_TQ, "triplet-quarter");
  const allowTS = has(U_TS, "triplet-sixteenth");

  if (!allowTE && !allowTQ && !allowTS) {
    // Nothing to normalize
    return units.slice();
  }

  // Tally counts of each unit in the bar
  const counts = new Map<number, number>();
  for (const x of units) counts.set(x, (counts.get(x) ?? 0) + 1);

  // Helper: try to "borrow" a donor unit and explode it into N triplet-units
  const borrow = (donorU: number, tripU: number) => {
    const c = counts.get(donorU) ?? 0;
    if (c <= 0) return false;
    counts.set(donorU, c - 1);
    const k = Math.floor(donorU / tripU);
    counts.set(tripU, (counts.get(tripU) ?? 0) + k);
    return true;
  };

  // Preferred donors (smallest first) for each triplet base
  const U_W = u("whole");
  const U_H = u("half");
  const U_Q = u("quarter");
  const U_E = u("eighth");

  const donorsForTE = [U_Q, U_H, U_W].filter((d) => d % U_TE === 0);
  const donorsForTQ = [U_H, U_W].filter((d) => d % U_TQ === 0);
  const donorsForTS = [U_E, U_Q, U_H, U_W].filter((d) => d % U_TS === 0);

  // Fix each triplet family independently to make counts % 3 == 0
  const fixFamily = (tripU: number, donors: number[]) => {
    if (!tripU) return;
    let ct = counts.get(tripU) ?? 0;
    if (ct % 3 === 0) return;

    // Try borrowing donors until divisible by 3 or donors exhausted
    // (We loop a bit to cover cases where we need multiple donors.)
    for (let guard = 0; guard < 32 && (ct % 3) !== 0; guard++) {
      let changed = false;
      for (const d of donors) {
        if (borrow(d, tripU)) { ct = counts.get(tripU) ?? 0; changed = true; break; }
      }
      if (!changed) break; // can't fix further with available donors
    }

    // If still not divisible by 3, as a last resort: convert leftovers DOWN
    // E.g., 6→OK, 5→make one quarter + 3 triplets + 2 triplets left? messy.
    // We only handle the minimal safe case where we can merge exactly:
    // TE: 3 * TE == Q ; TQ: 3 * TQ == H ; TS: 3 * TS == E
    ct = counts.get(tripU) ?? 0;
    const rem = ct % 3;
    if (rem === 0) return;

    const mergeMap: Record<number, number | undefined> = {
      [U_TE]: U_Q,
      [U_TQ]: U_H,
      [U_TS]: U_E,
    };
    const target = mergeMap[tripU];
    if (target) {
      // While we have ≥3, fold some groups back to the base unit,
      // keeping the remainder as small as possible.
      while ((counts.get(tripU) ?? 0) >= 3 && (counts.get(tripU)! % 3) !== 0) {
        counts.set(tripU, (counts.get(tripU) ?? 0) - 3);
        counts.set(target, (counts.get(target) ?? 0) + 1);
      }
    }
  };

  if (allowTE) fixFamily(U_TE, donorsForTE);
  if (allowTQ) fixFamily(U_TQ, donorsForTQ);
  if (allowTS) fixFamily(U_TS, donorsForTS);

  // Now build an ordered units array where triplets appear in contiguous 3s.
  const rebuild = (): number[] => {
    const out: number[] = [];

    // Push triplet groups in random order between families for some variety
    const tripFamilies: Array<{ tripU: number; label: "TE" | "TQ" | "TS" }> = [];
    if (allowTE && (counts.get(U_TE) ?? 0) > 0) tripFamilies.push({ tripU: U_TE, label: "TE" });
    if (allowTQ && (counts.get(U_TQ) ?? 0) > 0) tripFamilies.push({ tripU: U_TQ, label: "TQ" });
    if (allowTS && (counts.get(U_TS) ?? 0) > 0) tripFamilies.push({ tripU: U_TS, label: "TS" });

    // Pull triplet groups greedily, shuffling families a bit
    const pullTripGroups = () => {
      let progressed = false;
      const order = tripFamilies.slice().sort(() => (rnd() < 0.5 ? -1 : 1));
      for (const { tripU } of order) {
        while ((counts.get(tripU) ?? 0) >= 3) {
          out.push(tripU, tripU, tripU);
          counts.set(tripU, (counts.get(tripU) ?? 0) - 3);
          progressed = true;
        }
      }
      return progressed;
    };

    // Interleave: some non-triplets, then triplet groups, etc.
    // 1) Emit all non-triplet units (keeping their multiplicity)
    const isTrip = (x: number) => (allowTE && x === U_TE) || (allowTQ && x === U_TQ) || (allowTS && x === U_TS);

    const nonTripKeys = Array.from(counts.keys()).filter((k) => !isTrip(k));
    // Small to large for nicer reading
    nonTripKeys.sort((a, b) => a - b);
    for (const k of nonTripKeys) {
      let c = counts.get(k) ?? 0;
      while (c-- > 0) out.push(k);
      counts.set(k, 0);
    }

    // 2) Emit all triplet groups in 3s
    pullTripGroups();

    // 3) If *any* triplet leftovers remain (should be rare), just append them in 3s if possible.
    //    If we still have 1–2 items, they’ll remain as-is; but upstream borrowing should
    //    have eliminated this in normal pools.
    for (const tripU of [U_TE, U_TQ, U_TS]) {
      let c = counts.get(tripU) ?? 0;
      while (c >= 3) {
        out.push(tripU, tripU, tripU);
        c -= 3;
      }
      counts.set(tripU, c);
    }

    // 4) Absolute last resort: append any crumbs (should be zero). Keeping them avoids time drift.
    for (const [k, c] of counts.entries()) {
      for (let i = 0; i < c; i++) out.push(k);
      counts.set(k, 0);
    }

    return out;
  };

  return rebuild();
}

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
 * Guarantees:
 *  - First slot of every bar is a NOTE (prevents blank bars).
 *  - Soft-start rest probability to avoid all-rest openings.
 *  - Trims any trailing bars that contain only rests (ripple edit).
 *  - NEW: Triplet values (if allowed) always appear in contiguous groups of THREE.
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

  // If user's pool can't pack a full bar, extend grid with tiny fillers.
  if (!makeReach(coins, target)[target]) {
    for (const f of FILLERS) gridDen = lcm(gridDen, beatsFrac(f, den).d);
    bucket = unitsBucket([...available, ...FILLERS], den, gridDen);
    coins = Array.from(bucket.keys()).sort((a, b) => a - b);
    target = tsNum * gridDen;
  }

  const makeBarUnits = () => {
    const u = randomExactUnits(target, coins, rnd);
    if (!u.length) {
      // Fallback: quarters across the bar
      return Array.from({ length: tsNum }, () => toUnits("quarter", den, gridDen));
    }
    // ✨ NEW: enforce triplets in 3s
    return normalizeTripletsInUnits({ units: u, bucket, den, gridDen, rnd });
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

      // REST POLICY
      // 1) First slot in each bar must be a NOTE.
      // 2) Soft start: first couple of overall notes → reduce rest prob.
      // 3) If bar has no note yet, keep rests slightly toned down.
      let type: RhythmEvent["type"] = "note";
      if (allowRests) {
        const atBarStart = notesThisBar === 0;
        const softStart = notesTotal < 2;
        const ramped =
          atBarStart ? Math.min(restProb, 0.25) :
          softStart ? restProb * 0.4 :
          restProb;
        type = atBarStart ? "note" : (rnd() < ramped ? "rest" : "note");
      }

      if (type === "note") { notesThisBar++; notesTotal++; }
      out.push({ type, value: v });
    }

    // Safety: guarantee at least one NOTE in this bar
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

  // Trim trailing all-rest bars (ripple edit from the end).
  if (allowRests) {
    const barUnits = tsNum * gridDen;
    const unitsOf = (e: RhythmEvent) => toUnits(e.value, den, gridDen);

    let i = out.length - 1;
    while (i >= 0) {
      let sum = 0;
      let hasNote = false;
      let start = i;
      // accumulate one full bar from the end
      while (start >= 0 && sum < barUnits) {
        sum += unitsOf(out[start]);
        if (out[start].type === "note") hasNote = true;
        start--;
      }
      if (sum !== barUnits) break; // incomplete bar at end → keep it
      const barLen = i - start;
      if (!hasNote) {
        out.splice(start + 1, barLen); // remove this empty bar
        i = start;                     // continue trimming previous bar(s)
      } else {
        break; // last bar already has a note
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
 *  - After building, trims any trailing all-rest bars (ripple edit).
 *  - NEW: Triplet values (if allowed) always appear in contiguous groups of THREE.
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

  const makeBarVals = (): NoteValue[] => {
    const units = randomExactUnits(targetUnitsPerBar, coins, rnd);
    const normalizedUnits = units.length
      ? normalizeTripletsInUnits({ units, bucket, den, gridDen, rnd })
      : Array.from({ length: tsNum }, () => toUnits("quarter", den, gridDen));
    // Map units → concrete NoteValues
    return normalizedUnits.map((u) => {
      const vs = bucket.get(u)!;
      return vs[Math.floor(rnd() * vs.length)];
    });
  };

  const out: RhythmEvent[] = [];
  let notesSoFar = 0;

  bars_loop:
  while (notesSoFar < noteQuota) {
    const vals = makeBarVals();
    let barHasNote = false;

    for (let i = 0; i < vals.length; i++) {
      const v = vals[i];

      // REST POLICY (quota variant)
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

  // Trim trailing all-rest bars (ripple edit from the end).
  if (allowRests) {
    const barUnits = targetUnitsPerBar;
    const unitsOf = (e: RhythmEvent) => toUnits(e.value, den, gridDen);

    let i = out.length - 1;
    while (i >= 0) {
      let sum = 0;
      let hasNote = false;
      let start = i;
      while (start >= 0 && sum < barUnits) {
        sum += unitsOf(out[start]);
        if (out[start].type === "note") hasNote = true;
        start--;
      }
      if (sum !== barUnits) break; // partial bar at the very end — keep it
      const barLen = i - start;
      if (!hasNote) {
        out.splice(start + 1, barLen); // remove empty trailing bar
        i = start;                     // continue trimming previous bar(s)
      } else {
        break; // last bar already has a note
      }
    }
  }

  return out;
}
