// utils/scoring/intervals/computeIntervals.ts
import type { Phrase } from "@/utils/stage";
import { hzToMidi } from "@/utils/pitch/pitchMath";
import type { IntervalScore, PitchSample } from "../types";

export function computeIntervalScore(
  phrase: Phrase,
  voiced: PitchSample[]
): IntervalScore {
  if (phrase.notes.length < 2) return { total: 0, correct: 0, correctRatio: 1 };

  const mids: number[] = phrase.notes.map((n) =>
    medianMidiInRange(voiced, n.startSec, n.startSec + n.durSec)
  );

  let correct = 0, total = 0;
  for (let i = 1; i < phrase.notes.length; i++) {
    if (!isFinite(mids[i - 1]) || !isFinite(mids[i])) continue;
    const exp = phrase.notes[i].midi - phrase.notes[i - 1].midi;
    const got = mids[i] - mids[i - 1];
    const errCents = 100 * (got - exp);
    if (Math.abs(errCents) <= 50) correct++;
    total++;
  }
  return { total, correct, correctRatio: total ? correct / total : 1 };
}

function medianMidiInRange(samples: PitchSample[], t0: number, t1: number): number {
  const S = samples.filter((s) => s.tSec >= t0 && s.tSec <= t1 && (s.hz ?? 0) > 0);
  if (!S.length) return NaN;
  const mids = S.map((s) => hzToMidi(s.hz!)).filter(Number.isFinite).sort((a, b) => a - b);
  return mids[Math.floor(mids.length / 2)];
}
