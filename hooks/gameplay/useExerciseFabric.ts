// hooks/gameplay/useExerciseFabric.ts
import { useMemo } from "react";
import type { Phrase as StagePhrase } from "@/utils/stage";
import type { RhythmEvent } from "@/utils/phrase/generator";
import {
  buildBarsRhythmForQuota,
  buildIntervalPhrase,
  buildPhraseFromScaleSequence,
  buildPhraseFromScaleWithRhythm,
  buildTwoBarRhythm,
  sequenceNoteCountForScale,
} from "@/utils/phrase/generator";
import { beatsToSeconds, noteValueToBeats, type NoteValue } from "@/utils/time/tempo";
import { makeSolfegeLyrics } from "@/utils/lyrics/solfege";
import { keyNameFromTonicPc } from "@/components/training/layout/stage/sheet/vexscore/builders";
import type { SessionConfig } from "@/components/training/session/types";

const rand32 = () => (Math.floor(Math.random() * 0xffffffff) >>> 0);

export type ExerciseFabric = {
  phrase: StagePhrase | null;
  melodyRhythm: RhythmEvent[] | null;
  syncRhythmFabric: RhythmEvent[] | null;
  words: string[] | null;
  keySig: string | null;
  fallbackPhraseSec: number;
};

export function useExerciseFabric(opts: {
  sessionConfig: SessionConfig;
  lowHz: number | null;
  highHz: number | null;
  seedBump: number;
}): ExerciseFabric {
  const { sessionConfig, lowHz, highHz, seedBump } = opts;

  const {
    bpm, ts, noteValue, noteDurSec,
    lyricStrategy, scale, rhythm,
    exerciseBars,
    tonicMidis, allowedMidis,
    randomIncludeUnder, randomIncludeOver,
    customPhrase, customWords,
    allowedDegrees,
  } = sessionConfig;

  const haveRange = lowHz != null && highHz != null;

  const rhythmSeed = useMemo(() => rand32(), [seedBump]);
  const scaleSeed  = useMemo(() => rand32(), [seedBump]);
  const syncSeed   = useMemo(() => rand32(), [seedBump]);

  const lengthBars = Math.max(1, Number((rhythm as any)?.lengthBars ?? exerciseBars ?? 2));

  // ---- rest policy calc (unchanged) ----
  const lineAllowRests: boolean = (rhythm as any)?.allowRests !== false;
  const lineRestProbRaw: number = (rhythm as any)?.restProb ?? 0.3;
  const lineRestProb = lineAllowRests ? lineRestProbRaw : 0;

  const contentAllowRests: boolean = (() => {
    const v = (rhythm as any)?.contentAllowRests;
    return v == null ? lineAllowRests : v !== false;
  })();
  const contentRestProbRaw: number = (() => {
    const v = (rhythm as any)?.contentRestProb;
    return v == null ? lineRestProbRaw : v;
  })();
  const contentRestProb = contentAllowRests ? contentRestProbRaw : 0;

  // ---- BLUE RHYTHM (unchanged) ----
  const syncRhythmFabric: RhythmEvent[] | null = useMemo(() => {
    if (!rhythm) return null;
    const lineEnabled = (rhythm as any).lineEnabled !== false;
    if (!lineEnabled) return null;

    const available = (rhythm as any).available?.length
      ? (rhythm as any).available
      : ["quarter"];

    if ((rhythm as any).mode === "sequence") {
      const base = sequenceNoteCountForScale((scale?.name ?? "major") as any);
      const want =
        ((rhythm as any).pattern === "asc-desc" || (rhythm as any).pattern === "desc-asc")
          ? base * 2 - 1
          : base;
      return buildBarsRhythmForQuota({
        bpm, den: ts.den, tsNum: ts.num,
        available,
        restProb: lineRestProb,
        allowRests: lineAllowRests,
        seed: syncSeed,
        noteQuota: want,
      });
    }

    return buildTwoBarRhythm({
      bpm, den: ts.den, tsNum: ts.num,
      available,
      restProb: lineRestProb,
      allowRests: lineAllowRests,
      seed: syncSeed,
      bars: lengthBars,
    });
  }, [rhythm, bpm, ts.den, ts.num, scale?.name, syncSeed, lengthBars, lineAllowRests, lineRestProb]);

  // ---- MELODY FABRIC ----
  const generated = useMemo((): { phrase: StagePhrase | null; melodyRhythm: RhythmEvent[] | null } => {
    if (customPhrase) return { phrase: customPhrase, melodyRhythm: null };
    if (!haveRange || !scale || !rhythm) return { phrase: null, melodyRhythm: null };

    const available = (rhythm as any).available?.length
      ? (rhythm as any).available
      : ["quarter"];

    if ((rhythm as any).mode === "interval") {
      // interval mode timing prep (unchanged)
      const beatNote = ((): NoteValue => {
        switch (ts.den) {
          case 1:  return "whole";
          case 2:  return "half";
          case 4:  return "quarter";
          case 8:  return "eighth";
          case 16: return "sixteenth";
          case 32: return "thirtysecond";
          default: return "quarter";
        }
      })();
      const pairRhythm: RhythmEvent[] = [
        { type: "note", value: beatNote },
        { type: "note", value: beatNote },
      ];

      // score rhythm for interval view
      const perPair: RhythmEvent[] = (() => {
        const usedBeats = 2;
        const restBeats = Math.max(0, ts.num - usedBeats);
        return [
          ...pairRhythm,
          ...Array.from({ length: restBeats }, () => ({ type: "rest", value: beatNote } as const)),
        ];
      })();
      const melodyRhythm = Array.from({ length: (rhythm as any).numIntervals || 8 }, () => perPair).flat();

      const phrase = buildIntervalPhrase({
        lowHz: lowHz as number,
        highHz: highHz as number,
        a4Hz: 440,
        bpm, den: ts.den,
        tsNum: ts.num,
        tonicPc: scale.tonicPc,
        scale: scale.name as any,
        intervals: (rhythm as any).intervals || [3, 5],
        numIntervals: (rhythm as any).numIntervals || 8,
        pairRhythm,
        gapRhythm: [],
        seed: scaleSeed,
        tonicMidis,
        /** NEW: degree filter */
        allowedDegreeIndices: sessionConfig.allowedDegrees ?? null,
        /** Still respect absolute whitelists if present */
        allowedMidis,
      });
      return { phrase, melodyRhythm };
    }

    if ((rhythm as any).mode === "sequence") {
      const base = sequenceNoteCountForScale(scale.name);
      const want =
        ((rhythm as any).pattern === "asc-desc" || (rhythm as any).pattern === "desc-asc")
          ? base * 2 - 1
          : base;

      const fabric = buildBarsRhythmForQuota({
        bpm, den: ts.den, tsNum: ts.num,
        available,
        restProb: contentRestProb,
        allowRests: contentAllowRests,
        seed: rhythmSeed,
        noteQuota: want,
      });

      const phrase = buildPhraseFromScaleSequence({
        lowHz: lowHz as number,
        highHz: highHz as number,
        a4Hz: 440,
        bpm, den: ts.den,
        tonicPc: scale.tonicPc,
        scale: scale.name,
        rhythm: fabric,
        pattern: (rhythm as any).pattern,
        noteQuota: want,
        seed: scaleSeed,
        tonicMidis,
        /** NEW */
        allowedDegreeIndices: sessionConfig.allowedDegrees ?? null,
        allowedMidis,
      });

      return { phrase, melodyRhythm: fabric };
    }

    const fabric = buildTwoBarRhythm({
      bpm, den: ts.den, tsNum: ts.num,
      available,
      restProb: contentRestProb,
      allowRests: contentAllowRests,
      seed: rhythmSeed,
      bars: lengthBars,
    });

    const phrase = buildPhraseFromScaleWithRhythm({
      lowHz: lowHz as number,
      highHz: highHz as number,
      a4Hz: 440,
      bpm, den: ts.den,
      tonicPc: scale.tonicPc,
      scale: scale.name,
      rhythm: fabric,
      maxPerDegree: scale.maxPerDegree ?? 2,
      seed: scaleSeed,
      tonicMidis,
      includeUnder: !!randomIncludeUnder,
      includeOver: !!randomIncludeOver,
      /** NEW */
      allowedDegreeIndices: sessionConfig.allowedDegrees ?? null,
      allowedMidis,
    });

    return { phrase, melodyRhythm: fabric };
  }, [
    customPhrase, haveRange, lowHz, highHz, bpm, ts.den, ts.num,
    scale, rhythm, rhythmSeed, scaleSeed, lengthBars,
    tonicMidis, allowedMidis, randomIncludeUnder, randomIncludeOver,
    contentAllowRests, contentRestProb, sessionConfig.allowedDegrees,
  ]);

  const phrase = generated.phrase;

  // lyrics (unchanged)
  const words: string[] | null = useMemo(() => {
    if (Array.isArray(customWords) && customWords.length) {
      if (phrase?.notes?.length) {
        const n = phrase.notes.length;
        const base = [...customWords.slice(0, n)];
        while (base.length < n) base.push("la");
        return base;
      }
      return customWords;
    }
    if (phrase && scale && lyricStrategy === "solfege") {
      return makeSolfegeLyrics(phrase, scale.tonicPc, scale.name as any, {
        chromaticStyle: "auto",
        caseStyle: "lower",
      });
    }
    return null;
  }, [customWords, phrase, lyricStrategy, scale]);

  const keySig: string | null = useMemo(() => {
    if (!scale) return null;
    return keyNameFromTonicPc(scale.tonicPc, scale.name as any, false);
  }, [scale]);

  const genNoteDurSec =
    typeof noteValue === "string"
      ? beatsToSeconds(noteValueToBeats(noteValue, ts.den), bpm, ts.den)
      : (noteDurSec ?? (60 / bpm));

  const fallbackPhraseSec =
    beatsToSeconds(2 * ts.num, bpm, ts.den) ?? genNoteDurSec * 8;

  return {
    phrase,
    melodyRhythm: generated.melodyRhythm ?? null,
    syncRhythmFabric,
    words,
    keySig,
    fallbackPhraseSec,
  };
}
