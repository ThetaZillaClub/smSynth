import type { Phrase } from "@/utils/stage";
import { hzToMidi } from "@/utils/pitch/pitchMath";
import type { IntervalScore, PitchSample } from "../types";
import { intervalLabel } from "@/components/training/layout/stage/side-panel/SidePanelScores/format";

/**
 * Computes interval accuracy across adjacent notes in a phrase
 * using median MIDI in each notated window, with a ±50¢ correctness band.
 * Includes a bucket for 0 semitones (Perfect Unison) and buckets up to 12 (Octave).
 */
export function computeIntervalScore(phrase: Phrase, voiced: PitchSample[]): IntervalScore {
  if (!phrase.notes || phrase.notes.length < 2) {
    return { total: 0, correct: 0, correctRatio: 1, classes: makeEmptyClasses() };
  }

  const mids: number[] = phrase.notes.map((n) =>
    medianMidiInRange(voiced, n.startSec, n.startSec + n.durSec)
  );

  // Prepare buckets 0..12 (0=unison, 12=octave)
  const by: Map<number, { attempts: number; correct: number }> = new Map();
  for (let k = 0; k <= 12; k++) by.set(k, { attempts: 0, correct: 0 });

  let correct = 0;
  let total = 0;

  for (let i = 1; i < phrase.notes.length; i++) {
    if (!isFinite(mids[i - 1]) || !isFinite(mids[i])) continue;

    const exp = phrase.notes[i].midi - phrase.notes[i - 1].midi;
    const got = mids[i] - mids[i - 1];

    // Clamp to 0..12 classes
    const clampClass = (x: number) => {
      const a = Math.abs(Math.round(x));
      return a > 12 ? 12 : a;
    };
    const expSemi = clampClass(exp);

    const errCents = 100 * (got - exp);
    const ok = Math.abs(errCents) <= 50;

    const cell = by.get(expSemi);
    if (cell) {
      cell.attempts += 1;
      if (ok) cell.correct += 1;
    }

    total++;
    if (ok) correct++;
  }

  const classes = Array.from(by.entries()).map(([semi, v]) => ({
    semitones: semi,
    label: intervalLabel(semi),
    attempts: v.attempts,
    correct: v.correct,
    percent: v.attempts ? (100 * v.correct) / v.attempts : 0,
  }));

  return { total, correct, correctRatio: total ? correct / total : 1, classes };
}

function makeEmptyClasses() {
  // Build 0..12 for consistency with runtime buckets
  return Array.from({ length: 13 }, (_, i) => ({
    semitones: i,
    label: intervalLabel(i),
    attempts: 0,
    correct: 0,
    percent: 0,
  }));
}

function medianMidiInRange(samples: PitchSample[], t0: number, t1: number): number {
  const S = samples.filter(
    (s) => s.tSec >= t0 && s.tSec <= t1 && (s.hz ?? 0) > 0
  );
  if (!S.length) return NaN;
  const mids = S.map((s) => hzToMidi(s.hz!))
    .filter((x) => Number.isFinite(x))
    .sort((a, b) => a - b);
  return mids[Math.floor(mids.length / 2)];
}
