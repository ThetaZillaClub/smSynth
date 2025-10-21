// utils/scoring/intervals/computeIntervals.ts
import type { Phrase } from "@/utils/stage";
import { hzToMidi } from "@/utils/pitch/pitchMath";
import type { IntervalScore, PitchSample } from "../types";
import { intervalLabel } from "@/components/training/layout/stage/side-panel/SidePanelScores/format";
import { linearCredit50_100 } from "../helpers";

/**
 * Interval accuracy with fractional credit:
 * - 100% credit ≤ centsOk (default 50¢)
 * - Linear falloff to 0% by 100¢
 * - Median MIDI per note window (unchanged)
 * - Buckets 0..12 semitones (unison..octave)
 *
 * Direction-agnostic: compares |got| to |expected| so do→la and la→do both count.
 */
export function computeIntervalScore(
  phrase: Phrase,
  voiced: PitchSample[],
  centsOk: number = 50
): IntervalScore {
  if (!phrase.notes || phrase.notes.length < 2) {
    return { total: 0, correct: 0, correctRatio: 1, classes: makeEmptyClasses() };
  }

  const mids: number[] = phrase.notes.map((n) =>
    medianMidiInRange(voiced, n.startSec, n.startSec + n.durSec)
  );

  const by: Map<number, { attempts: number; correct: number }> = new Map();
  for (let k = 0; k <= 12; k++) by.set(k, { attempts: 0, correct: 0 });

  let total = 0;
  let sumCredit = 0;

  for (let i = 1; i < phrase.notes.length; i++) {
    if (!isFinite(mids[i - 1]) || !isFinite(mids[i])) continue;

    const exp = phrase.notes[i].midi - phrase.notes[i - 1].midi; // semitones
    const got = mids[i] - mids[i - 1];                           // semitones

    // Direction-agnostic cents error: |100 * (|got| - |exp|)|
    const errCents = Math.abs(100 * (Math.abs(got) - Math.abs(exp)));

    // same linear credit as pitch
    const credit = linearCredit50_100(errCents, centsOk, 200);

    const cls = Math.min(12, Math.abs(Math.round(exp)));
    const cell = by.get(cls)!;
    cell.attempts += 1;
    cell.correct += credit;

    total++;
    sumCredit += credit;
  }

  const classes = Array.from(by.entries()).map(([semi, v]) => ({
    semitones: semi,
    label: intervalLabel(semi),
    attempts: v.attempts,
    correct: v.correct,
    percent: v.attempts ? (100 * v.correct) / v.attempts : 0,
  }));

  return {
    total,
    correct: sumCredit,
    correctRatio: total ? sumCredit / total : 1,
    classes,
  };
}

function makeEmptyClasses() {
  return Array.from({ length: 13 }, (_, i) => ({
    semitones: i,
    label: intervalLabel(i),
    attempts: 0,
    correct: 0,
    percent: 0,
  }));
}

function medianMidiInRange(samples: PitchSample[], t0: number, t1: number): number {
  const S = samples.filter((s) => s.tSec >= t0 && s.tSec <= t1 && (s.hz ?? 0) > 0);
  if (!S.length) return NaN;
  const mids = S.map((s) => hzToMidi(s.hz!))
    .filter((x) => Number.isFinite(x))
    .sort((a, b) => a - b);
  return mids[Math.floor(mids.length / 2)];
}
