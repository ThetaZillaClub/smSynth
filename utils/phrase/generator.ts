// utils/phrase/generator.ts
import { hzToMidi } from "@/utils/pitch/pitchMath";
import type { Phrase } from "@/utils/piano-roll/scale";
import { degreeIndex, isInScale, scaleSemitones, type ScaleName } from "./scales";
import { noteValueToSeconds, noteValueToBeats, type NoteValue } from "@/utils/time/tempo";

/** Rhythm event — can be a 'note' or a 'rest' with a musical value */
export type RhythmEvent = { type: "note" | "rest"; value: NoteValue };

/* ---------------- RNG + small utils ---------------- */

function makeRng(seed: number) {
  // xorshift32
  let x = seed >>> 0;
  return () => {
    x ^= x << 13; x >>>= 0;
    x ^= x >> 17; x >>>= 0;
    x ^= x << 5;  x >>>= 0;
    return (x >>> 0) / 0xffffffff;
  };
}

function choose<T>(arr: T[], rnd: () => number): T {
  return arr[Math.floor(rnd() * arr.length)];
}

/* ---------------- exact rational beat math helpers ---------------- */

type Rat = { n: number; d: number };
const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : Math.abs(a));
const lcm = (a: number, b: number): number => Math.abs(a / (gcd(a, b) || 1) * b);
const reduce = ({ n, d }: Rat): Rat => {
  const g = gcd(n, d) || 1;
  return { n: n / g, d: d / g };
};

/** Quarter-note fractions (exact) for every NoteValue. (quarter = 1) */
const QF: Record<NoteValue, Rat> = {
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

/** Exact beats (relative to denominator beat) for a NoteValue. */
function beatsFrac(v: NoteValue, den: number): Rat {
  // beats = quarter_units * (den / 4)
  const { n, d } = QF[v];
  return reduce({ n: n * den, d: d * 4 });
}

/** Per-beat integer grid = LCM of denominators from available values. */
function makeBeatGridDen(available: NoteValue[], den: number): number {
  let g = 1;
  for (const v of available) {
    const { d } = beatsFrac(v, den);
    g = lcm(g, d);
  }
  return g;
}

/** Convert a NoteValue to integer units given per-beat grid denominator. */
function toUnits(v: NoteValue, den: number, gridDen: number): number {
  const { n, d } = beatsFrac(v, den);
  // beats = n/d, 1 beat = gridDen units → units = n * (gridDen / d)
  return (n * gridDen) / d; // integer because gridDen is LCM of all d's
}

/** Build a lookup: units → list of NoteValues with that exact size (for variety). */
function unitsBucket(available: NoteValue[], den: number, gridDen: number): Map<number, NoteValue[]> {
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
function makeReach(coins: number[], target: number): boolean[] {
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
function randomExactUnits(target: number, coins: number[], rnd: () => number): number[] {
  const reach = makeReach(coins, target);
  if (!reach[target]) return [];
  const parts: number[] = [];
  let rem = target;
  // prefer shorter coins a bit to avoid too-sparse bars
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
const FILLERS: NoteValue[] = [
  "triplet-sixteenth",
  "sixteenth",
  "triplet-eighth",
  "eighth",
];

/* ---------------- existing exports (kept) ---------------- */

export function buildEqualRhythm(note: NoteValue, length = 8): RhythmEvent[] {
  return Array.from({ length }, () => ({ type: "note", value: note }));
}

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
    const isRest = opts.allowRests !== false && rnd() < 0.2; // 20% rests
    out.push({ type: isRest ? "rest" : "note", value: val });
  }
  return out;
}

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

/**
 * Generate a phrase inside [lowHz, highHz] using a scale + rhythm.
 * Rests are encoded as gaps (advance time but no note).
 */
export function buildPhraseFromScaleWithRhythm(params: {
  lowHz: number;
  highHz: number;
  a4Hz?: number;
  bpm: number;
  den: number;
  tonicPc: number;
  scale: ScaleName;
  rhythm: RhythmEvent[];
  maxPerDegree?: number; // default 2
  seed?: number;
}): Phrase {
  const {
    lowHz, highHz, bpm, den,
    tonicPc, scale, rhythm,
    a4Hz = 440, maxPerDegree = 2, seed = 0x9E3779B9,
  } = params;

  const lowM = Math.round(hzToMidi(lowHz, a4Hz));
  const highM = Math.round(hzToMidi(highHz, a4Hz));
  const lo = Math.min(lowM, highM);
  const hi = Math.max(lowM, highM);

  // Precompute all allowed MIDI notes in window for the chosen scale
  const allowed: number[] = [];
  for (let m = lo; m <= hi; m++) {
    const pc = ((m % 12) + 12) % 12;
    if (isInScale(pc, tonicPc, scale)) allowed.push(m);
  }
  if (!allowed.length) {
    const mid = Math.round((lo + hi) / 2);
    const dur = rhythm.reduce((s, r) => s + noteValueToSeconds(r.value, bpm, den), 0) || 1;
    return {
      durationSec: dur,
      notes: [{ midi: mid, startSec: 0, durSec: dur }],
    };
  }

  const degCounts = new Map<number, number>(); // degreeIndex -> count
  const rnd = makeRng(seed);

  const toDegreeIndex = (m: number) =>
    degreeIndex(((m % 12) + 12) % 12, tonicPc, scale);
  const fitsCap = (m: number) => {
    const di = toDegreeIndex(m);
    if (di < 0) return false;
    const c = degCounts.get(di) ?? 0;
    return c < maxPerDegree;
  };

  // pick a sensible starting pitch: first allowed >= middle, else nearest
  const midTarget = Math.round((lo + hi) / 2);
  let cur = allowed.find((m) => m >= midTarget) ?? allowed[allowed.length - 1];

  let t = 0;
  const notes: { midi: number; startSec: number; durSec: number }[] = [];

  for (const ev of rhythm) {
    const durSec = noteValueToSeconds(ev.value, bpm, den);

    if (ev.type === "rest") {
      t += durSec;
      continue;
    }

    // choose next note near current; prefer ± small steps; sometimes leap
    const near: number[] = [];
    const leap: number[] = [];

    for (const m of allowed) {
      const delta = Math.abs(m - cur);
      if (delta <= 2) near.push(m);
      else leap.push(m);
    }

    let choices = rnd() < 0.75 ? near : leap;
    if (!choices.length) choices = allowed.slice();

    let filtered = choices.filter(fitsCap);
    if (!filtered.length) filtered = choices; // if all capped, ignore cap this time

    const tight = filtered.filter((m) => Math.abs(m - cur) <= 6);
    const finalPool = tight.length ? tight : filtered;

    const next = choose(finalPool, rnd);
    const di = toDegreeIndex(next);
    if (di >= 0) degCounts.set(di, (degCounts.get(di) ?? 0) + 1);

    notes.push({ midi: next, startSec: t, durSec });
    t += durSec;
    cur = next;
  }

  return { durationSec: t, notes };
}

/* ---------------- Rhythm builders used by TrainingGame ---------------- */

/**
 * Build a rhythm that fills an exact number of whole bars using a whitelist of note values.
 * - Exactly fills `bars * tsNum` beats (within exact rational math).
 * - Respects allowRests: if false, emits no rests.
 * - You can bias rest density via restProb.
 *
 * NOTE: Backwards-compatible name; you can pass `{ bars: N }` now (default 2).
 */
export function buildTwoBarRhythm(opts: {
  bpm: number;
  den: number;
  tsNum: number;           // numerator
  available: NoteValue[];  // allowed values (e.g., ["quarter","eighth"])
  restProb?: number;       // default 0.3
  allowRests?: boolean;    // default true
  seed?: number;
  noteQuota?: number;      // ignored here; parity
  bars?: number;           // NEW (default 2)
}): RhythmEvent[] {
  const {
    den, tsNum,
    available,
    restProb = 0.3,
    allowRests = true,
    seed = 0xA5F3D7,
    bars = 2,
  } = opts;

  const rnd = makeRng(seed);

  // Build per-beat grid from the *actual* available set.
  let gridDen = makeBeatGridDen(available, den);
  let bucket = unitsBucket(available, den, gridDen);
  let coins = Array.from(bucket.keys()).sort((a, b) => a - b);

  // Target units per bar
  let target = tsNum * gridDen;

  // If a bar isn't packable with just the user's pool, permissively extend grid with tiny fillers.
  const barReachable = makeReach(coins, target)[target];
  if (!barReachable) {
    for (const f of FILLERS) {
      gridDen = lcm(gridDen, beatsFrac(f, den).d);
    }
    bucket = unitsBucket([...available, ...FILLERS], den, gridDen);
    coins = Array.from(bucket.keys()).sort((a, b) => a - b);
    target = tsNum * gridDen;
  }

  const makeBarUnits = () => {
    const u = randomExactUnits(target, coins, rnd);
    // If somehow unreachable (shouldn't happen), fall back to a single bar of quarters.
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

  // Make sure there's at least one rest if rests are allowed: flip an early note.
  if (allowRests && !out.some((e) => e.type === "rest")) {
    const i = out.findIndex((e) => e.type === "note");
    if (i >= 0) out[i] = { ...out[i], type: "rest" };
  }

  return out;
}

/**
 * Build as many whole bars as needed to supply exactly `noteQuota` NOTE slots.
 * - Each bar is packed exactly to the meter using rational math (see helpers above).
 * - When rests are allowed, NOTE density is controlled by `restProb` but *never*
 *   breaks the bar math—extra notes are flipped to rests if we exceed the quota.
 * - Stops as soon as we’ve produced `noteQuota` NOTE slots (rest slots excluded).
 */
export function buildBarsRhythmForQuota(opts: {
  bpm: number;
  den: number;
  tsNum: number;
  available: NoteValue[];
  restProb?: number;     // default 0.3
  allowRests?: boolean;  // default true
  seed?: number;
  noteQuota: number;     // how many NOTE events we need in total
}): RhythmEvent[] {
  const {
    den, tsNum,
    available,
    restProb = 0.3,
    allowRests = true,
    seed = 0xA5F3D7,
    noteQuota,
  } = opts;

  const rnd = makeRng(seed);

  // Build grid/buckets from available; expand with tiny fillers only if truly needed.
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

  while (notesSoFar < noteQuota) {
    const vals = makeBarVals();
    for (const v of vals) {
      let type: RhythmEvent["type"] = "note";
      if (allowRests) {
        // cap notes to quota, flip to rests when quota is satisfied
        if (notesSoFar >= noteQuota) type = "rest";
        else type = rnd() < restProb ? "rest" : "note";
      }
      if (type === "note") notesSoFar++;
      out.push({ type, value: v });
    }
    // If rests are not allowed and we just crossed the quota, stop here.
    if (!allowRests && notesSoFar >= noteQuota) break;
  }

  // If we overshot but rests are allowed, flip extra trailing notes to rests.
  if (allowRests && notesSoFar > noteQuota) {
    let extra = notesSoFar - noteQuota;
    for (let i = out.length - 1; i >= 0 && extra > 0; i--) {
      if (out[i].type === "note") { out[i] = { ...out[i], type: "rest" }; extra--; }
    }
  }

  return out;
}

/** Example-driven sequence length per scale (for mapping sequence patterns). */
export function sequenceNoteCountForScale(name: ScaleName): number {
  if (name === "chromatic") return 12; // as requested
  if (name === "major_pentatonic" || name === "minor_pentatonic") return 5; // as requested
  return 8; // diatonic family → 8 (include octave)
}

/**
 * Build a phrase following a scale sequence pattern:
 * patterns: "asc" | "desc" | "asc-desc" | "desc-asc"
 * NOTE slots in rhythm consume the sequence in order; REST slots become gaps.
 */
export function buildPhraseFromScaleSequence(params: {
  lowHz: number;
  highHz: number;
  a4Hz?: number;
  bpm: number;
  den: number;
  tonicPc: number;
  scale: ScaleName;
  rhythm: RhythmEvent[]; // variable length (>= 1 bar; commonly multiple bars)
  pattern: "asc" | "desc" | "asc-desc" | "desc-asc";
  noteQuota: number;     // how many NOTE targets to emit (e.g., 12 chromatic, 8 diatonic incl. octave, 5 pentatonic)
  seed?: number;         // only used to break ties on which octave to pick
}): Phrase {
  const {
    lowHz, highHz, bpm, den,
    tonicPc, scale, rhythm,
    pattern, noteQuota,
    a4Hz = 440,
    seed = 0xD1A1,
  } = params;

  // --- Allowed MIDI window ---
  const loM = Math.round(hzToMidi(Math.min(lowHz, highHz), a4Hz));
  const hiM = Math.round(hzToMidi(Math.max(lowHz, highHz), a4Hz));

  // Collect all MIDI notes in [loM..hiM] that are in the chosen scale
  const allowed: number[] = [];
  for (let m = loM; m <= hiM; m++) {
    const pc = ((m % 12) + 12) % 12;
    if (isInScale(pc, tonicPc, scale)) allowed.push(m);
  }
  if (!allowed.length) {
    // No notes available: return an all-rest phrase with correct total time
    const totalSec = rhythm.reduce((s, r) => s + noteValueToSeconds(r.value, bpm, den), 0);
    return { durationSec: totalSec, notes: [] };
  }

  // --- Degree offsets inside one octave ---
  const baseOffsets = scaleSemitones(scale).slice().sort((a, b) => a - b);

  // Create exactly `noteQuota` ascending degree offsets, repeating into next octaves as needed.
  const buildAscendingOffsets = (quota: number): number[] => {
    const out: number[] = [];
    let k = 0;
    while (out.length < quota) {
      const idx = k % baseOffsets.length;
      const oct = Math.floor(k / baseOffsets.length);
      const off = baseOffsets[idx] + 12 * oct;
      out.push(off);
      k++;
    }
    return out.slice(0, quota);
  };

  const asc = buildAscendingOffsets(noteQuota); // strictly ascending degree run

  // Utility: list all tonic MIDI candidates (pc == tonicPc) within range
  const tonicCandidates: number[] = [];
  for (let m = loM; m <= hiM; m++) {
    if ((((m % 12) + 12) % 12) === ((tonicPc % 12) + 12) % 12) tonicCandidates.push(m);
  }
  if (!tonicCandidates.length) {
    // Fallback: pick the nearest allowed to tonic pitch-class by proximity
    tonicCandidates.push(allowed[0]);
  }

  // Choose a tonic so the entire ascending run fits the window if possible.
  const center = Math.round((loM + hiM) / 2);
  type Fit = { base: number; fits: boolean; overflow: number; dist: number };
  const fits: Fit[] = tonicCandidates.map((base) => {
    const lastAsc = base + asc[asc.length - 1];
    const firstAsc = base + asc[0];
    const overflow = Math.max(0, loM - firstAsc) + Math.max(0, lastAsc - hiM);
    return { base, fits: overflow === 0, overflow, dist: Math.abs(base - center) };
  });

  // Prefer perfect fits, then minimal overflow, then proximity (deterministic tiebreak)
  fits.sort((a, b) => {
    if (a.fits !== b.fits) return a.fits ? -1 : 1;
    if (a.overflow !== b.overflow) return a.overflow - b.overflow;
    if (a.dist !== b.dist) return a.dist - b.dist;
    const ra = ((a.base ^ seed) >>> 0) & 0xffff;
    const rb = ((b.base ^ seed) >>> 0) & 0xffff;
    return ra - rb;
  });
  const chosenBase = fits[0]?.base ?? tonicCandidates[0];

  const ascTargets = asc.map((o) => chosenBase + o).filter((m) => m >= loM && m <= hiM);

  // Helper: concat without duplicating join point
  const concatNoDup = (a: number[], b: number[]) => {
    if (!a.length) return b.slice();
    if (!b.length) return a.slice();
    const out = a.slice();
    if (a[a.length - 1] === b[0]) out.push(...b.slice(1));
    else out.push(...b);
    return out;
  };

  let targets: number[] = [];
  switch (pattern) {
    case "asc":
      targets = ascTargets.slice(0, noteQuota);
      break;

    case "desc":
      targets = ascTargets.slice(0, noteQuota).reverse();
      break;

    case "asc-desc": {
      const up = ascTargets.slice(0, Math.max(1, Math.ceil(noteQuota / 2)));
      const down = up.slice().reverse();
      targets = concatNoDup(up, down).slice(0, noteQuota);
      break;
    }

    case "desc-asc": {
      const down = ascTargets.slice(0, Math.max(1, Math.ceil(noteQuota / 2))).reverse();
      const up = down.slice().reverse();
      targets = concatNoDup(down, up).slice(0, noteQuota);
      break;
    }
  }

  // If we fell short due to clipping, repeat last valid to meet quota
  while (targets.length < noteQuota && targets.length > 0) {
    targets.push(targets[targets.length - 1]);
  }

  // --- Map targets onto rhythm NOTE slots in order ---
  let t = 0;
  let ti = 0;
  const notes: { midi: number; startSec: number; durSec: number }[] = [];
  for (const ev of rhythm) {
    const d = noteValueToSeconds(ev.value, bpm, den);
    if (ev.type === "note" && ti < targets.length) {
      notes.push({ midi: targets[ti++], startSec: t, durSec: d });
    }
    t += d;
  }

  return { durationSec: t, notes };
}
