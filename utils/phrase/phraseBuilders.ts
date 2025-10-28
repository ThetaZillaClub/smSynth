// utils/phrase/phraseBuilders.ts
import { hzToMidi } from "@/utils/pitch/pitchMath";
import type { Phrase } from "@/utils/stage";
import { degreeIndex, isInScale, scaleSemitones, type ScaleName } from "./scales";
import { noteValueToSeconds, noteValueToBeats, beatsToSeconds } from "@/utils/time/tempo";
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
  maxPerDegree?: number;
  seed?: number;

  tonicMidis?: number[] | null;
  includeUnder?: boolean;
  includeOver?: boolean;

  /** NEW: filter by scale-degree indices (0-based within scale) */
  allowedDegreeIndices?: number[] | null;

  /** Legacy absolute whitelist (still supported if present). */
  allowedMidis?: number[] | null;

  /**
   * NEW: If true (default when `allowedDegreeIndices` is provided), remove the
   * upper-octave duplicate of the selected degree(s) inside each tonic window
   * [T, T+12]. This prevents A3 being chosen when A2 is intended, etc.
   */
  dropUpperWindowDegrees?: boolean;
};

/** Generate a phrase inside [lowHz, highHz] using a scale + rhythm. */
export function buildPhraseFromScaleWithRhythm(params: BuildPhraseWithRhythmParams): Phrase {
  const {
    lowHz, highHz, bpm, den,
    tonicPc, scale, rhythm,
    a4Hz = 440,
    // ⬇ caller's value, else default to 1 when degrees are limited, else 2
    maxPerDegree: maxPerDegreeInput,
    seed = 0x9e3779b9,
    tonicMidis = null,
    includeUnder = false,
    includeOver = false,
    allowedDegreeIndices = null,
    allowedMidis = null,
    dropUpperWindowDegrees,
  } = params;

  const maxPerDegree =
    maxPerDegreeInput ??
    ((allowedDegreeIndices && allowedDegreeIndices.length) ? 1 : 2);

  const lowM = Math.round(hzToMidi(lowHz, a4Hz));
  const highM = Math.round(hzToMidi(highHz, a4Hz));
  const lo = Math.min(lowM, highM);
  const hi = Math.max(lowM, highM);

  // Base: in-range & in-scale
  let allowed: number[] = [];
  for (let m = lo; m <= hi; m++) {
    const pc = ((m % 12) + 12) % 12;
    if (isInScale(pc, tonicPc, scale)) allowed.push(m);
  }

  // ---- DEGREE FILTER APPLIES **ONLY INSIDE SELECTED WINDOWS** ----
  if (tonicMidis && tonicMidis.length) {
    const sorted = Array.from(new Set(tonicMidis.map((x) => Math.round(x)))).sort((a, b) => a - b);
    const windows = sorted.map((T) => [T, T + 12] as const);
    const minStart = windows[0][0];
    const maxEnd = windows[windows.length - 1][1];
    const inAnyWindow = (m: number) => windows.some(([s, e]) => m >= s && m <= e);

    // Partition allowed notes
    const inWin: number[] = [];
    const under: number[] = [];
    const over: number[] = [];
    for (const m of allowed) {
      if (inAnyWindow(m)) inWin.push(m);
      else if (m < minStart && includeUnder) under.push(m);
      else if (m > maxEnd && includeOver) over.push(m);
    }

    // Apply degree whitelist ONLY to in-window notes
    let inWinFiltered = inWin;
    if (allowedDegreeIndices && allowedDegreeIndices.length) {
      const set = new Set(allowedDegreeIndices);
      inWinFiltered = inWin.filter((m) => {
        const di = degreeIndex(((m % 12) + 12) % 12, tonicPc, scale);
        return di >= 0 && set.has(di);
      });
    }

    // ✨ NEW: drop upper-octave duplicates of selected degree(s) inside each window
    const shouldDropUpper =
      (dropUpperWindowDegrees !== undefined ? dropUpperWindowDegrees : !!(allowedDegreeIndices && allowedDegreeIndices.length)) &&
      sorted.length > 0;

    if (shouldDropUpper && inWinFiltered.length) {
      const offs = scaleSemitones(scale);
      const degOffsets = new Set<number>(
        (allowedDegreeIndices && allowedDegreeIndices.length
          ? allowedDegreeIndices
              .map((i) => (i >= 0 && i < offs.length ? offs[i] : undefined))
              .filter((x): x is number => typeof x === "number")
          : [offs[0] ?? 0])
      );

      const upperSet = new Set<number>();
      for (const T of sorted) {
        for (const off of degOffsets) {
          upperSet.add(Math.round(T + 12 + off));
        }
      }

      const trimmed = inWinFiltered.filter((m) => !upperSet.has(m));
      if (trimmed.length) inWinFiltered = trimmed;
    }

    const combined = Array.from(new Set<number>([...inWinFiltered, ...under, ...over])).sort((a, b) => a - b);
    if (combined.length) allowed = combined;
  } else {
    // No windows picked → degree filter applies globally (legacy behaviour)
    if (allowedDegreeIndices && allowedDegreeIndices.length) {
      const set = new Set(allowedDegreeIndices);
      const filtered = allowed.filter((m) => {
        const di = degreeIndex(((m % 12) + 12) % 12, tonicPc, scale);
        return di >= 0 && set.has(di);
      });
      if (filtered.length) allowed = filtered;
    }
  }

  // Optional absolute whitelist (still applies to the final pool)
  if (allowedMidis && allowedMidis.length) {
    const allow = new Set(allowedMidis.map((m) => Math.round(m)));
    const filtered = allowed.filter((m) => allow.has(m));
    if (filtered.length) allowed = filtered;
  }

  // Fallback if nothing is available after filtering
  if (!allowed.length) {
    const mid = Math.round((lo + hi) / 2);
    const dur = rhythm.reduce((s, r) => s + noteValueToSeconds(r.value, bpm, den), 0) || 1;
    return { durationSec: dur, notes: [{ midi: mid, startSec: 0, durSec: dur }] };
  }

  // ---------------- selection with uniqueness + per-degree cap ----------------
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
    if (ev.type === "rest") { t += durSec; continue; }

    const near: number[] = [];
    const leap: number[] = [];
    for (const m of allowed) {
      const delta = Math.abs(m - cur);
      if (delta <= 2) near.push(m);
      else leap.push(m);
    }
    let choices = rnd() < 0.75 ? near : leap;
    if (!choices.length) choices = allowed.slice();

    // respect per-degree cap
    let filtered = choices.filter(fitsCap);
    if (!filtered.length) filtered = choices;

    // prefer not to repeat the previous degree
    const prevDeg = notes.length ? toDegreeIndex(notes[notes.length - 1].midi) : -999;
    const nonRepeat = filtered.filter((m) => toDegreeIndex(m) !== prevDeg);
    if (nonRepeat.length) filtered = nonRepeat;

    // keep motion reasonable if possible
    const tight = filtered.filter((m) => Math.abs(m - cur) <= 6);
    const finalPool = tight.length ? tight : filtered;

    const next = choose(finalPool, rnd);
    const di = toDegreeIndex(next);
    if (di >= 0) degCounts.set(di, (degCounts.get(di) ?? 0) + 1);

    notes.push({ midi: next, startSec: t, durSec });
    t += durSec;
    cur = next;
  }

  // If this phrase is exactly TWO notes:
  // - Normal case: prefer different degrees for clarity.
  // - Special case (single allowed degree): keep the degree but prefer another OCTAVE.
  const noteSlots = rhythm.filter((r) => r.type === "note").length;
  if (noteSlots === 2 && notes.length === 2) {
    const onlyOneDegree =
      Array.isArray(allowedDegreeIndices) && allowedDegreeIndices.length === 1;
    const d0 = toDegreeIndex(notes[0].midi);
    const d1 = toDegreeIndex(notes[1].midi);
    if (d0 === d1) {
      if (onlyOneDegree) {
        // same degree allowed → try to pick same-degree, different OCTAVE for note 2
        const sameDegOtherOct = allowed.filter(
          (m) => toDegreeIndex(m) === d0 && Math.round(m) !== Math.round(notes[0].midi)
        );
        if (sameDegOtherOct.length) {
          const target = notes[1].midi;
          const best = sameDegOtherOct.reduce(
            (best, m) => (Math.abs(m - target) < Math.abs(best - target) ? m : best),
            sameDegOtherOct[0]
          );
          notes[1].midi = best;
        }
      } else {
        // normal rule: force different degrees if possible
        const alts = allowed.filter((m) => toDegreeIndex(m) !== d0);
        if (alts.length) {
          const target = notes[1].midi;
          const best = alts.reduce(
            (best, m) => (Math.abs(m - target) < Math.abs(best - target) ? m : best),
            alts[0]
          );
          notes[1].midi = best;
        }
      }
    }
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
  tonicMidis?: number[] | null;
  /** NEW */
  allowedDegreeIndices?: number[] | null;
  allowedMidis?: number[] | null;
  /** NEW: mirror random-mode behavior for sequence mode */
  dropUpperWindowDegrees?: boolean;
};

export function buildPhraseFromScaleSequence(params: BuildSequenceParams): Phrase {
  const {
    lowHz, highHz, bpm, den,
    tonicPc, scale, rhythm, pattern, noteQuota: noteQuotaParam,
    a4Hz = 440, seed = 0xd1a1,
    tonicMidis = null,
    allowedDegreeIndices = null,
    allowedMidis = null,
    dropUpperWindowDegrees = false,
  } = params;

  const loM = Math.round(hzToMidi(Math.min(lowHz, highHz), a4Hz));
  const hiM = Math.round(hzToMidi(Math.max(lowHz, highHz), a4Hz));

  // base allowed in-range & in-scale
  let allowed: number[] = [];
  for (let m = loM; m <= hiM; m++) {
    const pc = ((m % 12) + 12) % 12;
    if (isInScale(pc, tonicPc, scale)) allowed.push(m);
  }

  // degree filter (NEW)
  if (allowedDegreeIndices && allowedDegreeIndices.length) {
    const set = new Set(allowedDegreeIndices);
    allowed = allowed.filter((m) => {
      const di = degreeIndex(((m % 12) + 12) % 12, tonicPc, scale);
      return di >= 0 && set.has(di);
    });
  }

  if (!allowed.length) {
    const totalSec = rhythm.reduce((s, r) => s + noteValueToSeconds(r.value, bpm, den), 0);
    return { durationSec: totalSec, notes: [] };
  }

  // ---- degree offsets limited to allowed degrees (single window/octave)
  const allOffsets = scaleSemitones(scale).slice().sort((a, b) => a - b);
  const degOffsetsRaw = (allowedDegreeIndices && allowedDegreeIndices.length)
    ? allowedDegreeIndices
    .map((i) => (i >= 0 && i < allOffsets.length ? allOffsets[i] : undefined))
    .filter((x): x is number => typeof x === "number")
    : allOffsets;
  const degOffsets = Array.from(new Set(degOffsetsRaw)).sort((a, b) => a - b);
  if (!degOffsets.length) {
    const totalSec = rhythm.reduce((s, r) => s + noteValueToSeconds(r.value, bpm, den), 0);
    return { durationSec: totalSec, notes: [] };
  }
  const K = degOffsets.length; // number of unique degrees in phrase

  // tonic candidates inside range
  const tonicCandidates: number[] = [];
  for (let m = loM; m <= hiM; m++) {
    if ((((m % 12) + 12) % 12) === ((tonicPc % 12) + 12) % 12) tonicCandidates.push(m);
  }

  // restrict to selected tonic windows if given
  let effectiveCandidates = tonicCandidates;
  if (tonicMidis && tonicMidis.length) {
    const set = new Set(tonicMidis.map((x) => Math.round(x)));
    const filtered = tonicCandidates.filter((m) => set.has(m));
    if (filtered.length) effectiveCandidates = filtered;
  }

  // further restrict by per-note whitelist (if present)
  const allowSet = allowedMidis && allowedMidis.length
    ? new Set(allowedMidis.map((m) => Math.round(m)))
    : null;
  if (allowSet) {
    const filtered = effectiveCandidates.filter((m) => allowSet.has(m));
    if (filtered.length) effectiveCandidates = filtered;
  }
  if (!effectiveCandidates.length) effectiveCandidates = tonicCandidates.length ? tonicCandidates : [allowed[0]];

  const center = Math.round((loM + hiM) / 2);
  // pick base so chosen window [base+minOff, base+maxOff] fits range
  type Fit = { base: number; fits: boolean; overflow: number; dist: number };
  const minOff = degOffsets[0];
  const maxOff = degOffsets[degOffsets.length - 1];
  const fits: Fit[] = effectiveCandidates.map((base) => {
    const lowT = base + minOff;
    const highT = base + maxOff;
    const overflow = Math.max(0, loM - lowT) + Math.max(0, highT - hiM);
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

  // ascending list inside chosen window
  let ascTargets = degOffsets.map((o) => chosenBase + o).filter((m) => m >= loM && m <= hiM);
  if (allowSet) ascTargets = ascTargets.filter((m) => allowSet.has(m));

  // optional: drop upper-window octave duplicate for sequence mode too
  if (dropUpperWindowDegrees && tonicMidis && tonicMidis.length) {
    const sorted = Array.from(new Set(tonicMidis.map((x) => Math.round(x)))).sort((a, b) => a - b);
    const upperSet = new Set<number>();
    for (const T of sorted) for (const off of degOffsets) upperSet.add(Math.round(T + 12 + off));
    ascTargets = ascTargets.filter((m) => !upperSet.has(m));
  }

  const concatNoDup = (a: number[], b: number[]) => {
    if (!a.length) return b.slice();
    if (!b.length) return a.slice();
    const out = a.slice();
    if (a[a.length - 1] === b[0]) out.push(...b.slice(1));
    else out.push(...b);
    return out;
  };
  // phrase length:
  // - prefer the number of 'note' slots in rhythm (no silent gaps)
  // - else: asc/desc -> K, asc-desc/desc-asc -> 2*K-1
  const noteSlots = rhythm.reduce((s, r) => s + (r.type === "note" ? 1 : 0), 0);
  const defaultQuota = (pattern === "asc" || pattern === "desc") ? K : (2 * K - 1);
  const noteQuota = noteSlots || noteQuotaParam || defaultQuota;

  let targets: number[] = [];
  switch (pattern) {
    case "asc":
      targets = ascTargets.slice(0, Math.max(1, Math.min(K, noteQuota)));
      break;
    case "desc":
      targets = ascTargets.slice(0, Math.max(1, Math.min(K, noteQuota))).reverse();
      break;
    case "asc-desc": {
      const up = ascTargets.slice(0, Math.max(1, K));
      const down = up.slice().reverse();
      targets = concatNoDup(up, down);
      break;
    }
    case "desc-asc": {
      const down = ascTargets.slice(0, Math.max(1, K)).reverse();
      const up = down.slice().reverse();
      targets = concatNoDup(down, up);
      break;
    }
  }
  // match target count to actual note slots
  if (targets.length > noteQuota) targets = targets.slice(0, noteQuota);
  else if (targets.length < noteQuota && targets.length > 0) {
    while (targets.length < noteQuota) targets.push(targets[targets.length - 1]);
  }

  // map targets onto rhythm
  let t = 0;
  let ti = 0;
  const notes: { midi: number; startSec: number; durSec: number }[] = [];
  for (const ev of rhythm) {
    const d = noteValueToSeconds(ev.value, bpm, den);
    if (ev.type === "note") {
      notes.push({ midi: targets[ti++], startSec: t, durSec: d });
    }
    t += d;
  }
  return { durationSec: t, notes };
}

/* ======================  INTERVAL TRAINING (scale-aware)  ====================== */

export type BuildIntervalPhraseParams = {
  lowHz: number;
  highHz: number;
  a4Hz?: number;
  bpm: number;
  den: number;
  tsNum: number;
  tonicPc: number;
  scale: ScaleName;
  intervals: number[];
  numIntervals: number;
  pairRhythm: RhythmEvent[];
  gapRhythm: RhythmEvent[];
  seed?: number;

  tonicMidis?: number[] | null;

  /** NEW: degree filter applied to BOTH notes */
  allowedDegreeIndices?: number[] | null;

  /** Optional whitelist of absolute MIDI notes (both root & top must be allowed). */
  allowedMidis?: number[] | null;
};

export function buildIntervalPhrase(params: BuildIntervalPhraseParams): Phrase {
  const {
    lowHz, highHz, a4Hz = 440,
    bpm, den, tsNum,
    tonicPc, scale,
    intervals, numIntervals,
    pairRhythm, gapRhythm, // gap ignored now
    seed = 0x1234,
    tonicMidis = null,
    allowedDegreeIndices = null,
    allowedMidis = null,
  } = params;

  const loM = Math.round(hzToMidi(Math.min(lowHz, highHz), a4Hz));
  const hiM = Math.round(hzToMidi(Math.max(lowHz, highHz), a4Hz));
  const rnd = makeRng(seed);

  // in-range, in-scale
  let allowedAbs = new Set<number>();
  for (let m = loM; m <= hiM; m++) {
    const pc = ((m % 12) + 12) % 12;
    if (isInScale(pc, tonicPc, scale)) allowedAbs.add(m);
  }

  // degree filter (NEW)
  if (allowedDegreeIndices && allowedDegreeIndices.length) {
    const set = new Set(allowedDegreeIndices);
    allowedAbs = new Set(
      Array.from(allowedAbs).filter((m) => {
        const di = degreeIndex(((m % 12) + 12) % 12, tonicPc, scale);
        return di >= 0 && set.has(di);
      })
    );
  }

  // tonic windows (both notes must be inside)
  if (tonicMidis && tonicMidis.length) {
    const sorted = Array.from(new Set(tonicMidis.map((x) => Math.round(x)))).sort((a, b) => a - b);
    const windows = sorted.map((T) => [T, T + 12] as const);
    const inAny = (m: number) => windows.some(([s, e]) => m >= s && m <= e);
    allowedAbs = new Set(Array.from(allowedAbs).filter(inAny));
  }

  // absolute whitelist (both notes)
  if (allowedMidis && allowedMidis.length) {
    const allow = new Set(allowedMidis.map((m) => Math.round(m)));
    allowedAbs = new Set(Array.from(allowedAbs).filter((m) => allow.has(m)));
  }

  const allowedList = Array.from(allowedAbs).sort((a, b) => a - b);

  // precompute valid pairs
  type Pair = { root: number; top: number };
  const pairs: Pair[] = [];
  if (allowedList.length) {
    const allowedSet = new Set(allowedList);
    for (const r of allowedList) {
      for (const k of intervals) {
        const up = r + k;
        const dn = r - k;
        if (allowedSet.has(up)) pairs.push({ root: r, top: up });
        if (allowedSet.has(dn)) pairs.push({ root: r, top: dn });
      }
    }
  }

  const totalPairDurSec = pairRhythm.reduce((s, ev) => s + noteValueToSeconds(ev.value, bpm, den), 0);
  const barDurSec = beatsToSeconds(tsNum, bpm, den);
  if (!pairs.length) {
    const mid = allowedList.length ? allowedList[Math.floor(allowedList.length / 2)] : Math.round((loM + hiM) / 2);
    const total = numIntervals * barDurSec;
    return { durationSec: total, notes: [{ midi: mid, startSec: 0, durSec: total }] };
  }

  // emit pairs (each pair occupies one full bar)
  const notes: Phrase["notes"] = [];
  let t = 0;

  for (let i = 0; i < numIntervals; i++) {
    const { root, top } = choose(pairs, rnd);

    let idx = 0;
    for (const ev of pairRhythm) {
      const dur = noteValueToSeconds(ev.value, bpm, den);
      if (ev.type === "note") {
        const midi = idx === 0 ? root : top;
        notes.push({ midi, startSec: t, durSec: dur });
        idx++;
      }
      t += dur;
    }

    // pad bar
    const usedBeats = pairRhythm.reduce((s, ev) => s + noteValueToBeats(ev.value, den), 0);
    const padBeats = Math.max(0, tsNum - usedBeats);
    const remainSec = beatsToSeconds(padBeats, bpm, den);
    t += remainSec;
  }

  return { durationSec: t, notes };
}