// utils/phrase/phraseBuilders.ts
import { hzToMidi } from "@/utils/pitch/pitchMath";
import type { Phrase } from "@/utils/stage";
import { degreeIndex, isInScale, scaleSemitones, type ScaleName } from "./scales";
import { noteValueToSeconds } from "@/utils/time/tempo";
import { choose, makeRng } from "./random";
import type { RhythmEvent } from "./phraseTypes";

/** Example-driven sequence length per scale (for mapping sequence patterns). */
export function sequenceNoteCountForScale(name: ScaleName): number {
  if (name === "chromatic") return 12;
  if (name === "major_pentatonic" || name === "minor_pentatonic") return 5;
  return 8; // diatonic family → 8 (include octave)
}

export type BuildPhraseWithRhythmParams = {
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

  /** Optional absolute tonic windows: each T defines [T, T+12]. */
  tonicMidis?: number[] | null;
  /** Random mode only — also allow notes below the lowest selected window. */
  includeUnder?: boolean;
  /** Random mode only — also allow notes above the highest selected window. */
  includeOver?: boolean;

  /** Optional hard whitelist of absolute MIDI notes to allow. */
  allowedMidis?: number[] | null;
};

/** Generate a phrase inside [lowHz, highHz] using a scale + rhythm. */
export function buildPhraseFromScaleWithRhythm(params: BuildPhraseWithRhythmParams): Phrase {
  const {
    lowHz,
    highHz,
    bpm,
    den,
    tonicPc,
    scale,
    rhythm,
    a4Hz = 440,
    maxPerDegree = 2,
    seed = 0x9e3779b9,
    tonicMidis = null,
    includeUnder = false,
    includeOver = false,
    allowedMidis = null,
  } = params;

  const lowM = Math.round(hzToMidi(lowHz, a4Hz));
  const highM = Math.round(hzToMidi(highHz, a4Hz));
  const lo = Math.min(lowM, highM);
  const hi = Math.max(lowM, highM);

  let allowed: number[] = [];
  for (let m = lo; m <= hi; m++) {
    const pc = ((m % 12) + 12) % 12;
    if (isInScale(pc, tonicPc, scale)) allowed.push(m);
  }

  // Apply absolute-tonic windows (if provided)
  if (tonicMidis && tonicMidis.length) {
    const sorted = Array.from(new Set(tonicMidis.map((x) => Math.round(x)))).sort((a, b) => a - b);
    const windows = sorted.map((T) => [T, T + 12] as const);
    const minStart = windows[0][0];
    const maxEnd = windows[windows.length - 1][1];
    const inAnyWindow = (m: number) => windows.some(([s, e]) => m >= s && m <= e);
    const underOk = includeUnder ? (m: number) => m < minStart : () => false;
    const overOk = includeOver ? (m: number) => m > maxEnd : () => false;
    const filtered = allowed.filter((m) => inAnyWindow(m) || underOk(m) || overOk(m));
    if (filtered.length) allowed = filtered;
  }

  // Apply per-note whitelist (if provided)
  if (allowedMidis && allowedMidis.length) {
    const allow = new Set(allowedMidis.map((m) => Math.round(m)));
    const filtered = allowed.filter((m) => allow.has(m));
    if (filtered.length) allowed = filtered;
  }

  if (!allowed.length) {
    const mid = Math.round((lo + hi) / 2);
    const dur = rhythm.reduce((s, r) => s + noteValueToSeconds(r.value, bpm, den), 0) || 1;
    return { durationSec: dur, notes: [{ midi: mid, startSec: 0, durSec: dur }] };
  }

  const degCounts = new Map<number, number>();
  const rnd = makeRng(seed);
  const toDegreeIndex = (m: number) => degreeIndex(((m % 12) + 12) % 12, tonicPc, scale);
  const fitsCap = (m: number) => {
    const di = toDegreeIndex(m);
    if (di < 0) return false;
    const c = degCounts.get(di) ?? 0;
    return c < maxPerDegree;
  };

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
    if (!filtered.length) filtered = choices;
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

export type BuildSequenceParams = {
  lowHz: number;
  highHz: number;
  a4Hz?: number;
  bpm: number;
  den: number;
  tonicPc: number;
  scale: ScaleName;
  rhythm: RhythmEvent[];
  pattern: "asc" | "desc" | "asc-desc" | "desc-asc";
  noteQuota: number;
  seed?: number;

  /** Restrict permissible starting tonics (absolute MIDI). */
  tonicMidis?: number[] | null;

  /** Optional hard whitelist of absolute MIDI notes to allow. */
  allowedMidis?: number[] | null;
};

/** Build a phrase following a scale sequence pattern; NOTE slots consume targets; REST slots become gaps. */
export function buildPhraseFromScaleSequence(params: BuildSequenceParams): Phrase {
  const {
    lowHz,
    highHz,
    bpm,
    den,
    tonicPc,
    scale,
    rhythm,
    pattern,
    noteQuota,
    a4Hz = 440,
    seed = 0xd1a1,
    tonicMidis = null,
    allowedMidis = null,
  } = params;

  const loM = Math.round(hzToMidi(Math.min(lowHz, highHz), a4Hz));
  const hiM = Math.round(hzToMidi(Math.max(lowHz, highHz), a4Hz));

  const allowed: number[] = [];
  for (let m = loM; m <= hiM; m++) {
    const pc = ((m % 12) + 12) % 12;
    if (isInScale(pc, tonicPc, scale)) allowed.push(m);
  }
  if (!allowed.length) {
    const totalSec = rhythm.reduce((s, r) => s + noteValueToSeconds(r.value, bpm, den), 0);
    return { durationSec: totalSec, notes: [] };
  }

  const baseOffsets = scaleSemitones(scale).slice().sort((a, b) => a - b);
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
  const asc = buildAscendingOffsets(noteQuota);

  // Find absolute tonic candidates in range
  const tonicCandidates: number[] = [];
  for (let m = loM; m <= hiM; m++) {
    if ((((m % 12) + 12) % 12) === ((tonicPc % 12) + 12) % 12) tonicCandidates.push(m);
  }

  // Restrict to selected absolute tonics if provided
  let effectiveCandidates = tonicCandidates;
  if (tonicMidis && tonicMidis.length) {
    const set = new Set(tonicMidis.map((x) => Math.round(x)));
    const filtered = tonicCandidates.filter((m) => set.has(m));
    if (filtered.length) effectiveCandidates = filtered;
  }
  // Further restrict base to per-note whitelist (if provided)
  const allowSet = allowedMidis && allowedMidis.length
    ? new Set(allowedMidis.map((m) => Math.round(m)))
    : null;
  if (allowSet) {
    const filtered = effectiveCandidates.filter((m) => allowSet.has(m));
    if (filtered.length) effectiveCandidates = filtered;
  }
  if (!effectiveCandidates.length) effectiveCandidates = tonicCandidates.length ? tonicCandidates : [allowed[0]];

  const center = Math.round((loM + hiM) / 2);
  type Fit = { base: number; fits: boolean; overflow: number; dist: number };
  const fits: Fit[] = effectiveCandidates.map((base) => {
    const lastAsc = base + asc[asc.length - 1];
    const firstAsc = base + asc[0];
    const overflow = Math.max(0, loM - firstAsc) + Math.max(0, lastAsc - hiM);
    return { base, fits: overflow === 0, overflow, dist: Math.abs(base - center) };
  });
  fits.sort((a, b) => {
    if (a.fits !== b.fits) return a.fits ? -1 : 1;
    if (a.overflow !== b.overflow) return a.overflow - b.overflow;
    if (a.dist !== b.dist) return a.dist - b.dist;
    const ra = ((a.base ^ seed) >>> 0) & 0xffff;
    const rb = ((b.base ^ seed) >>> 0) & 0xffff;
    return ra - rb;
  });
  const chosenBase = fits[0]?.base ?? effectiveCandidates[0];

  // Build targets according to pattern
  let ascTargets = asc.map((o) => chosenBase + o).filter((m) => m >= loM && m <= hiM);
  if (allowSet) ascTargets = ascTargets.filter((m) => allowSet.has(m));

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
  while (targets.length < noteQuota && targets.length > 0) {
    targets.push(targets[targets.length - 1]);
  }

  // Map targets onto rhythm
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

export type RootPreference = "low" | "high" | "middle";

export type BuildIntervalPhraseParams = {
  lowHz: number;
  highHz: number;
  a4Hz?: number;
  bpm: number;
  den: number;
  intervals: number[]; // e.g. [3,5] for min3 and p4
  octaves: number; // max k for interval + 12*k, k=0 to octaves
  preference: RootPreference;
  numIntervals: number;
  pairRhythm: RhythmEvent[]; // rhythm for one interval pair
  gapRhythm: RhythmEvent[]; // between pairs
  seed?: number;

  /** Optional absolute-tonic windows to bias/limit root placement. */
  tonicMidis?: number[] | null;

  /** Optional hard whitelist of absolute MIDI notes to allow (both root and top must pass). */
  allowedMidis?: number[] | null;
};

export function buildIntervalPhrase(params: BuildIntervalPhraseParams): Phrase {
  const {
    lowHz,
    highHz,
    a4Hz = 440,
    bpm,
    den,
    intervals,
    octaves,
    preference,
    numIntervals,
    pairRhythm,
    gapRhythm,
    seed = 0x1234,
    tonicMidis = null,
    allowedMidis = null,
  } = params;

  const loM = Math.round(hzToMidi(lowHz, a4Hz));
  const hiM = Math.round(hzToMidi(highHz, a4Hz));
  const rnd = makeRng(seed);

  const allowSet = allowedMidis && allowedMidis.length
    ? new Set(allowedMidis.map((m) => Math.round(m)))
    : null;

  const notes: Phrase["notes"] = [];
  let t = 0;

  for (let i = 0; i < numIntervals; i++) {
    const base = choose(intervals, rnd);
    const k = Math.floor(rnd() * (octaves + 1));
    const semis = base + 12 * k;

    // Respect selected tonic windows if present
    let minRoot = loM;
    let maxRoot = hiM - semis;
    if (tonicMidis && tonicMidis.length) {
      const sorted = Array.from(new Set(tonicMidis.map((x) => Math.round(x)))).sort((a, b) => a - b);
      const winMin = sorted[0];
      const winMax = sorted[sorted.length - 1] + 12; // end of highest window
      minRoot = Math.max(minRoot, winMin);
      maxRoot = Math.min(maxRoot, winMax - semis);
    }

    if (maxRoot < minRoot) continue;

    // Candidate roots considering per-note whitelist (both notes must be allowed).
    let candidateRoots: number[] = [];
    for (let r = minRoot; r <= maxRoot; r++) {
      const okAllow = !allowSet || (allowSet.has(r) && allowSet.has(r + semis));
      if (okAllow) candidateRoots.push(r);
    }
    if (!candidateRoots.length) continue;

    let root: number;
    if (preference === "low") {
      root = candidateRoots[0];
    } else if (preference === "high") {
      root = candidateRoots[candidateRoots.length - 1];
    } else {
      // middle-ish
      root = candidateRoots[Math.floor(candidateRoots.length / 2)];
    }
    root = Math.max(minRoot, Math.min(maxRoot, root));

    let noteIdx = 0;
    for (const ev of pairRhythm) {
      const durSec = noteValueToSeconds(ev.value, bpm, den);
      if (ev.type === "rest") {
        t += durSec;
        continue;
      }
      const midi = noteIdx === 0 ? root : root + semis;
      notes.push({ midi, startSec: t, durSec });
      t += durSec;
      noteIdx++;
    }
    for (const ev of gapRhythm) {
      const durSec = noteValueToSeconds(ev.value, bpm, den);
      t += durSec;
    }
  }

  return { durationSec: t, notes };
}
