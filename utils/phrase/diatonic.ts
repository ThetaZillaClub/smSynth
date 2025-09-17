// utils/phrase/diatonic.ts
import { hzToMidi } from "../pitch/pitchMath";
import type { Phrase } from "../piano-roll/scale";

export const MAJOR_OFFSETS = [0, 2, 4, 5, 7, 9, 11, 12] as const;

// helpers
const MOD = (n: number, m: number) => ((n % m) + m) % m;

function isMajorDegree(midi: number, tonicPc: number) {
  const pc = MOD(midi - tonicPc, 12);
  return pc === 0 || pc === 2 || pc === 4 || pc === 5 || pc === 7 || pc === 9 || pc === 11;
}
function nextDegreeUp(midi: number, tonicPc: number): number {
  let m = midi + 1;
  while (!isMajorDegree(m, tonicPc)) m++;
  return m;
}
function prevDegreeDown(midi: number, tonicPc: number): number {
  let m = midi - 1;
  while (!isMajorDegree(m, tonicPc)) m--;
  return m;
}

/**
 * Build an 8-note *smooth* (stepwise) major-scale phrase within [lowHz, highHz].
 * - Picks a tonic (0..11) that maximizes how many ascending degrees fit in the window.
 * - Starts at the first degree >= low, ascends stepwise; if we hit the top, we bounce (ping-pong).
 * - Always returns 8 notes with equal durations.
 */
export function buildPhraseFromRangeDiatonicVariant(
  lowHz: number,
  highHz: number,
  a4Hz = 440,
  noteDurSec: number = 0.5,
  variantSeed?: number
): Phrase {
  const lowM = Math.round(hzToMidi(lowHz, a4Hz));
  const highM = Math.round(hzToMidi(highHz, a4Hz));
  const a = Math.min(lowM, highM);
  const b = Math.max(lowM, highM);

  // choose tonic that gives the longest straight run upward inside [a,b]
  let best = { tonic: 0, count: -1, first: a };
  for (let tonic = 0; tonic < 12; tonic++) {
    // first degree >= a
    let first = a;
    while (!isMajorDegree(first, tonic)) first++;
    if (first > b) continue;

    let m = first;
    let cnt = 1;
    while (true) {
      const nxt = nextDegreeUp(m, tonic);
      if (nxt > b) break;
      cnt++;
      m = nxt;
    }

    // prefer more degrees; break ties by first being closer to 'a'
    if (cnt > best.count || (cnt === best.count && first - a < best.first - a)) {
      best = { tonic, count: cnt, first };
    }
  }

  // fallback if nothing fit (extremely narrow window)
  let tonicPc = best.count > 0 ? best.tonic : MOD(a, 12);
  let cur = best.count > 0 ? best.first : a;

  // build 8 notes: stepwise, ping-pong inside [a,b]
  const notesMidi: number[] = [];
  let dir: 1 | -1 = 1; // ascend
  while (notesMidi.length < 8) {
    notesMidi.push(cur);

    // try next step
    let next = dir === 1 ? nextDegreeUp(cur, tonicPc) : prevDegreeDown(cur, tonicPc);

    // bounce if we'd leave the window
    if (next > b || next < a) {
      dir = dir === 1 ? -1 : 1;
      next = dir === 1 ? nextDegreeUp(cur, tonicPc) : prevDegreeDown(cur, tonicPc);

      // if still out (super narrow window), just duplicate current to fill
      if (next > b || next < a) {
        // ensure progress by nudging one semitone if absolutely necessary
        next = Math.min(b, Math.max(a, cur + (dir === 1 ? 1 : -1)));
      }
    }
    cur = next;
  }

  const dur = Math.max(0.05, noteDurSec);
  return {
    durationSec: notesMidi.length * dur,
    notes: notesMidi.map((m, i) => ({ midi: m, startSec: i * dur, durSec: dur })),
  };
}

/** (kept) legacy builder used elsewhere if needed */
export function buildPhraseFromRangeDiatonic(
  lowHz: number,
  highHz: number,
  a4Hz = 440,
  noteDurSec: number = 0.5
): Phrase {
  const low = Math.round(hzToMidi(lowHz, a4Hz));
  const high = Math.round(hzToMidi(highHz, a4Hz));
  const a = Math.min(low, high);
  const b = Math.max(low, high);
  const span = b - a;

  let mids: number[] = [];

  if (span >= 12) {
    const startMidi = Math.max(a, b - 12);
    mids = MAJOR_OFFSETS.map((off) => startMidi + off);
  } else {
    // legacy proportional spread (may duplicate)
    mids = MAJOR_OFFSETS.map((off) => {
      const ratio = off / 12;
      return Math.round(a + ratio * span);
    });
  }

  const dur = Math.max(0.05, noteDurSec);
  const notes = mids.map((m, i) => ({
    midi: m,
    startSec: i * dur,
    durSec: dur,
  }));

  return { durationSec: notes.length * dur, notes };
}
