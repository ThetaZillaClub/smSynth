// utils/phrase/generator.ts
import { hzToMidi } from "@/utils/pitch/pitchMath";
import type { Phrase } from "@/utils/piano-roll/scale";
import { degreeIndex, isInScale, scaleSemitones, type ScaleName } from "./scales";
import { noteValueToSeconds, noteValueToBeats, type NoteValue } from "@/utils/time/tempo";

/** Rhythm event — can be a 'note' or a 'rest' with a musical value */
export type RhythmEvent = { type: "note" | "rest"; value: NoteValue };

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

/* ---------------- Builders used by TrainingGame ---------------- */

/**
 * Build a 2-bar rhythm using a whitelist of note values.
 * - Exactly fills 2 bars (within float tolerance).
 * - Respects allowRests: if false, emits no rests.
 * - You can bias rest density via restProb.
 * - Optionally enforce a minimum number of NOTES (noteQuota) to support scale sequences.
 */
export function buildTwoBarRhythm(opts: {
  bpm: number;
  den: number;
  tsNum: number;         // numerator
  available: NoteValue[]; // allowed note values (e.g., ["quarter","eighth"])
  restProb?: number;     // default 0.3
  allowRests?: boolean;  // default true
  seed?: number;
  noteQuota?: number;    // ensure at least this many notes
}): RhythmEvent[] {
  const {
    bpm, den, tsNum,
    available,
    restProb = 0.3,
    allowRests = true,
    seed = 0xA5F3D7,
    noteQuota = 0,
  } = opts;

  const rnd = makeRng(seed);
  const targetSec = (2 * tsNum) * (60 / Math.max(1, bpm)) * (4 / Math.max(1, den));
  const dur = (v: NoteValue) => noteValueToSeconds(v, bpm, den);
  const EPS = 1e-4;

  let t = 0;
  const out: RhythmEvent[] = [];

  while (t + EPS < targetSec) {
    const remaining = targetSec - t + EPS;
    const candidates = available.filter((v) => dur(v) <= remaining + EPS);
    if (!candidates.length) break; // rounding tail
    const value = choose(candidates, rnd);
    const type: RhythmEvent["type"] = allowRests && rnd() < restProb ? "rest" : "note";
    out.push({ type, value });
    t += dur(value);
  }

  // Only ensure a rest if rests are allowed
  if (allowRests && !out.some((e) => e.type === "rest")) {
    const idx = out.findIndex((e) => e.type === "note");
    if (idx >= 0) out[idx] = { ...out[idx], type: "rest" };
    else if (out.length) out[out.length - 1] = { ...out[out.length - 1], type: "rest" };
    else out.push({ type: "rest", value: "quarter" });
  }

  // Enforce minimum note count by flipping rests if needed
  if (allowRests && noteQuota > 0) {
    let notes = out.filter((e) => e.type === "note").length;
    if (notes < noteQuota) {
      const restIdxs = out.map((e, i) => (e.type === "rest" ? i : -1)).filter((i) => i >= 0);
      for (let k = 0; k < restIdxs.length && notes < noteQuota; k++) {
        const i = restIdxs[k];
        out[i] = { ...out[i], type: "note" };
        notes++;
      }
    }
  }

  return out;
}

/** Build as many whole bars as needed to supply exactly `noteQuota` NOTE slots. */
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
    bpm, den, tsNum,
    available,
    restProb = 0.3,
    allowRests = true,
    seed = 0xA5F3D7,
    noteQuota,
  } = opts;

  const rnd = makeRng(seed);
  const beatsPerBar = Math.max(1, tsNum);
  const beats = (v: NoteValue) => noteValueToBeats(v, den);
  const EPS = 1e-4;

  const out: RhythmEvent[] = [];
  let notesSoFar = 0;

  const makeBar = () => {
    let used = 0;
    const bar: RhythmEvent[] = [];
    while (used + EPS < beatsPerBar) {
      const remaining = beatsPerBar - used + EPS;
      const candidates = available
        .map((v) => ({ v, b: beats(v) }))
        .filter((x) => x.b <= remaining + EPS)
        .sort((a, b) => a.b - b.b); // prefer shorter first for better packing
      if (!candidates.length) break;

      const pick = candidates[Math.floor(rnd() * candidates.length)].v;

      let type: RhythmEvent["type"] = allowRests && rnd() < restProb ? "rest" : "note";

      // If rests are allowed, constrain NOTE count to global quota.
      if (allowRests && type === "note" && notesSoFar >= noteQuota) type = "rest";

      bar.push({ type, value: pick });
      used += beats(pick);

      if (type === "note") notesSoFar++;
    }
    return bar;
  };

  // Keep adding bars until we’ve delivered at least `noteQuota` NOTE slots.
  while (notesSoFar < noteQuota) {
    out.push(...makeBar());
    // When rests are NOT allowed, we may overshoot noteQuota with pure notes; stop once quota met.
    if (!allowRests && notesSoFar >= noteQuota) break;
  }

  // If rests are allowed and we overshot, ensure EXACT number of note slots by flipping extras to RESTs.
  if (allowRests) {
    let extra = notesSoFar - noteQuota;
    if (extra > 0) {
      for (let i = out.length - 1; i >= 0 && extra > 0; i--) {
        if (out[i].type === "note") {
          out[i] = { ...out[i], type: "rest" };
          extra--;
        }
      }
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
  rhythm: RhythmEvent[]; // variable length (>= 2 bars)
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
