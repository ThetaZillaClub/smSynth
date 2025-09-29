// utils/scoring/rhythm/index.ts
import type { Phrase } from "@/utils/stage";
import type { Options, PitchSample, RhythmScore } from "../types";
import { evalMelodyCoverageRhythm } from "./melodyCoverage";
import { evalHandLineRhythm } from "./handline";

export function computeRhythmScore({
  phrase,
  samples,
  gestureEventsSec,
  melodyOnsetsSec,
  rhythmLineOnsetsSec,
  options,
}: {
  phrase: Phrase;
  samples: PitchSample[];
  gestureEventsSec: number[];
  melodyOnsetsSec: number[];
  rhythmLineOnsetsSec?: number[];
  options: Required<Pick<Options, "confMin" | "onsetGraceMs" | "maxAlignMs" | "goodAlignMs">>;
}): RhythmScore {
  const mel = evalMelodyCoverageRhythm({
    notes: phrase.notes.map((n) => ({ startSec: n.startSec, durSec: n.durSec })),
    samples,
    confMin: options.confMin,
    onsetGraceMs: options.onsetGraceMs,
    maxAlignMs: options.maxAlignMs,
  });

  const line = evalHandLineRhythm({
    onsets: rhythmLineOnsetsSec,
    events: gestureEventsSec,
    maxAlignMs: options.maxAlignMs,
    goodAlignMs: options.goodAlignMs,
    unique: true,
  });

  const tracks = [mel, line].filter((t) => t.evaluated);
  const combinedPercent = tracks.length
    ? tracks.reduce((a, t) => a + t.pct, 0) / tracks.length
    : 0;

  return {
    melodyPercent: mel.pct,
    melodyHitRate: mel.hitRate,
    melodyMeanAbsMs: mel.meanAbs,
    lineEvaluated: line.evaluated,
    linePercent: line.pct,
    lineHitRate: line.hitRate,
    lineMeanAbsMs: line.meanAbs,
    combinedPercent,
  };
}

export { evalMelodyCoverageRhythm } from "./melodyCoverage";
export { evalHandLineRhythm } from "./handline";
