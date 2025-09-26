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
import { beatsToSeconds, noteValueToBeats } from "@/utils/time/tempo";
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
  /** For timing fallbacks when phrase.durationSec is absent */
  fallbackPhraseSec: number;
};

export function useExerciseFabric(opts: {
  sessionConfig: SessionConfig;
  lowHz: number | null;
  highHz: number | null;
  seedBump: number;              // increment between takes to regenerate
}): ExerciseFabric {
  const { sessionConfig, lowHz, highHz, seedBump } = opts;

  const {
    bpm, ts, noteValue, noteDurSec,
    lyricStrategy, scale, rhythm,
    exerciseBars,
    tonicMidis, allowedMidis,
    randomIncludeUnder, randomIncludeOver,
    customPhrase, customWords,
  } = sessionConfig;

  const haveRange = lowHz != null && highHz != null;

  const rhythmSeed = useMemo(() => rand32(), [seedBump]);
  const scaleSeed  = useMemo(() => rand32(), [seedBump]);
  const syncSeed   = useMemo(() => rand32(), [seedBump]);

  const lengthBars = Math.max(1, Number((rhythm as any)?.lengthBars ?? exerciseBars ?? 2));

  // -------- Rest policy (line + content with inheritance) ----------
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

  // ------------------- BLUE RHYTHM (sync line) ---------------------
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

  // ---------------------- MELODY FABRIC ----------------------------
  const generated = useMemo((): { phrase: StagePhrase | null; melodyRhythm: RhythmEvent[] | null } => {
    if (customPhrase) return { phrase: customPhrase, melodyRhythm: null };
    if (!haveRange || !scale || !rhythm) return { phrase: null, melodyRhythm: null };

    const available = (rhythm as any).available?.length
      ? (rhythm as any).available
      : ["quarter"];

    if ((rhythm as any).mode === "interval") {
      const phrase = buildIntervalPhrase({
        lowHz: lowHz as number,
        highHz: highHz as number,
        a4Hz: 440,
        bpm, den: ts.den,
        tonicPc: scale.tonicPc,
        scale: scale.name as any,
        intervals: (rhythm as any).intervals || [3, 5],
        numIntervals: (rhythm as any).numIntervals || 8,
        pairRhythm: [
          { type: "note", value: "quarter" },
          { type: "note", value: "quarter" },
        ],
        gapRhythm: contentAllowRests ? [{ type: "rest", value: "eighth" }] : [],
        seed: scaleSeed,
        tonicMidis,
        allowedMidis,
      });
      return { phrase, melodyRhythm: null };
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
      includeUnder: !!sessionConfig.randomIncludeUnder,
      includeOver: !!sessionConfig.randomIncludeOver,
      allowedMidis,
    });

    return { phrase, melodyRhythm: fabric };
  }, [
    customPhrase, haveRange, lowHz, highHz, bpm, ts.den, ts.num,
    scale, rhythm, rhythmSeed, scaleSeed, lengthBars,
    tonicMidis, allowedMidis, sessionConfig.randomIncludeUnder, sessionConfig.randomIncludeOver,
    contentAllowRests, contentRestProb,
  ]);

  const phrase = generated.phrase;

  // -------------- Lyrics + Key (UI helpers co-located) --------------
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

  // -------------- fallback duration for timing --------------
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
