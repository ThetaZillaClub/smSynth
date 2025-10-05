import type { Phrase } from "@/utils/stage";
import type { Options, PitchSample, RhythmScore } from "../types";
import { evalMelodyCoverageRhythm } from "./melodyCoverage";
import { evalHandLineRhythm } from "./handline";

export function computeRhythmScore({
  phrase,
  samples,
  gestureEventsSec,
  melodyOnsetsSec, // (kept for API parity; not used in coverage model)
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
  const melR = evalMelodyCoverageRhythm({
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

  const tracks = [melR.summary, line].filter((t) => t.evaluated);
  const combinedPercent = tracks.length
    ? tracks.reduce((a, t) => a + t.pct, 0) / tracks.length
    : 0;

  return {
    melodyPercent: melR.summary.pct,
    melodyHitRate: melR.summary.hitRate,
    melodyMeanAbsMs: melR.summary.meanAbs,
    lineEvaluated: line.evaluated,
    linePercent: line.pct,
    lineHitRate: line.hitRate,
    lineMeanAbsMs: line.meanAbs,
    combinedPercent,
    perNoteMelody: melR.perNote,
    linePerEvent: line.perEvent,
  };
}
