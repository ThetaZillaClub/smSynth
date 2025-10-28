// hooks/gameplay/useExerciseFabric.ts

import * as React from "react";

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
import { hzToMidi } from "@/utils/pitch/pitchMath";
import { isInScale } from "@/utils/phrase/scales";

const rand32 = () => (Math.floor(Math.random() * 0xffffffff) >>> 0);

export type ExerciseFabric = {
  phrase: StagePhrase | null;
  melodyRhythm: RhythmEvent[] | null;
  syncRhythmFabric: RhythmEvent[] | null;
  words: string[] | null;
  keySig: string | null;
  fallbackPhraseSec: number;
};

/** Build all possible tonic windows (tonic..tonic+12) for a key inside a range. */
function windowsForKeyInRange(tonicPc: number, lowHz: number, highHz: number): number[] {
  const loM = Math.round(hzToMidi(Math.min(lowHz, highHz)));
  const hiM = Math.round(hzToMidi(Math.max(lowHz, highHz)));
  const pc = ((tonicPc % 12) + 12) % 12;
  const out: number[] = [];
  for (let m = loM; m <= hiM - 12; m++) {
    if ((((m % 12) + 12) % 12) === pc) out.push(m);
  }
  return out;
}

/** Choose a tonic window: prefer preferredOctaveIndex, else nearest to range center. */
function pickWindow(
  windows: number[],
  lowHz: number,
  highHz: number,
  preferredIndex: number | null
): number | null {
  if (!windows.length) return null;
  if (preferredIndex != null) {
    const idx = Math.max(0, Math.min(windows.length - 1, Math.floor(preferredIndex)));
    return windows[idx]!;
  }
  const loM = Math.round(hzToMidi(Math.min(lowHz, highHz)));
  const hiM = Math.round(hzToMidi(Math.max(lowHz, highHz))) - 12; // ensure full octave above tonic
  const center = Math.round((loM + hiM) / 2);
  return windows.slice().sort((a, b) => Math.abs(a - center) - Math.abs(b - center))[0]!;
}

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
    dropUpperWindowDegrees,
  } = sessionConfig;

  const haveRange = lowHz != null && highHz != null;

  const rhythmSeed = React.useMemo(() => rand32(), [seedBump]);
  const scaleSeed  = React.useMemo(() => rand32(), [seedBump]);
  const syncSeed   = React.useMemo(() => rand32(), [seedBump]);

  const lengthBars = Math.max(1, Number((rhythm as any)?.lengthBars ?? exerciseBars ?? 2));

  // ---- derive a safe tonic window if none was provided ----
  const tonicMidisSafe: number[] | null = React.useMemo(() => {
    if (tonicMidis && tonicMidis.length) return tonicMidis;
    if (!haveRange || !scale) return null;
    const wins = windowsForKeyInRange(scale.tonicPc, lowHz as number, highHz as number);
    if (!wins.length) return null;
    const pref =
      Array.isArray(sessionConfig.preferredOctaveIndices) &&
      sessionConfig.preferredOctaveIndices.length
        ? sessionConfig.preferredOctaveIndices[0]!
        : null;
    const chosen = pickWindow(wins, lowHz as number, highHz as number, pref);
    return chosen != null ? [chosen] : null;
  }, [tonicMidis, haveRange, scale, lowHz, highHz, sessionConfig.preferredOctaveIndices]);

  // ---- rest policy calc ----
  // IMPORTANT FIX: contentAllowRests must be *clamped* by lineAllowRests.
  // When resolveLessonToSession merges defaults, it may inject contentAllowRests:true.
  // If the author disabled rests at the line level (allowRests:false),
  // we hard-disable them for melody too.
  const lineAllowRests: boolean = (rhythm as any)?.allowRests !== false;
  const lineRestProbRaw: number = (rhythm as any)?.restProb ?? 0.3;
  const lineRestProb = lineAllowRests ? lineRestProbRaw : 0;

  const contentAllowRests: boolean = lineAllowRests && ((rhythm as any)?.contentAllowRests !== false);
  const contentRestProbRaw: number = (rhythm as any)?.contentRestProb ?? lineRestProbRaw;
  const contentRestProb = contentAllowRests ? contentRestProbRaw : 0;

  // ---- BLUE RHYTHM ----
  const syncRhythmFabric: RhythmEvent[] | null = React.useMemo(() => {
    if (!rhythm) return null;

    const lineEnabled = (rhythm as any).lineEnabled !== false;
    if (!lineEnabled) return null;

    const available = (rhythm as any).available?.length
      ? (rhythm as any).available
      : ["quarter"];

    if ((rhythm as any).mode === "sequence") {
      // Size quota by allowed degrees if present; else fall back to scale-based size.
      const degK = Array.isArray(sessionConfig.allowedDegrees) && sessionConfig.allowedDegrees.length
        ? new Set(
            sessionConfig.allowedDegrees
              .map((n) => Math.max(0, Math.floor(n)))
          ).size
        : sequenceNoteCountForScale((scale?.name ?? "major") as any);

      const isMirror =
        (rhythm as any).pattern === "asc-desc" ||
        (rhythm as any).pattern === "desc-asc";

      const want = Math.max(1, isMirror ? (degK * 2 - 1) : degK);

      const fabricRaw = buildBarsRhythmForQuota({
        bpm, den: ts.den, tsNum: ts.num,
        available,
        restProb: lineRestProb,
        allowRests: lineAllowRests,
        seed: syncSeed,
        noteQuota: want,
      });

      // Ensure no rests in the visual rhythm line when rests are disabled.
      return lineAllowRests ? fabricRaw : fabricRaw.filter((ev) => ev.type === "note");
    }

    return buildTwoBarRhythm({
      bpm, den: ts.den, tsNum: ts.num,
      available,
      restProb: lineRestProb,
      allowRests: lineAllowRests,
      seed: syncSeed,
      bars: lengthBars,
    });
  }, [rhythm, bpm, ts.den, ts.num, scale?.name, syncSeed, lengthBars, lineAllowRests, lineRestProb, sessionConfig.allowedDegrees]);

  // ---- MELODY FABRIC ----
  const generated = React.useMemo((): { phrase: StagePhrase | null; melodyRhythm: RhythmEvent[] | null } => {
    if (customPhrase) return { phrase: customPhrase, melodyRhythm: null };
    if (!haveRange || !scale || !rhythm) return { phrase: null, melodyRhythm: null };

    const available = (rhythm as any).available?.length
      ? (rhythm as any).available
      : ["quarter"];

    if ((rhythm as any).mode === "interval") {
      // interval mode timing prep
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
        tonicMidis: tonicMidisSafe,
        /** degree filter */
        allowedDegreeIndices: sessionConfig.allowedDegrees ?? null,
        /** Still respect absolute whitelists if present */
        allowedMidis,
      });

      return { phrase, melodyRhythm };
    }

    if ((rhythm as any).mode === "sequence") {
      // Size by allowed degrees: e.g., triad [0,2,4] => degK=3, asc-desc => 5
      const degK = Array.isArray(sessionConfig.allowedDegrees) && sessionConfig.allowedDegrees.length
        ? new Set(
            sessionConfig.allowedDegrees
              .map((n) => Math.max(0, Math.floor(n)))
          ).size
        : sequenceNoteCountForScale(scale.name);

      const isMirror =
        (rhythm as any).pattern === "asc-desc" ||
        (rhythm as any).pattern === "desc-asc";

      const want = Math.max(1, isMirror ? (degK * 2 - 1) : degK);

      const fabricRaw = buildBarsRhythmForQuota({
        bpm, den: ts.den, tsNum: ts.num,
        available,
        restProb: contentRestProb,
        allowRests: contentAllowRests,
        seed: rhythmSeed,
        noteQuota: want,
      });

      // Hard guarantee: if rests are disabled for content, strip them.
      const fabric = contentAllowRests ? fabricRaw : fabricRaw.filter((ev) => ev.type === "note");

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
        tonicMidis: tonicMidisSafe,
        /** degree filter */
        allowedDegreeIndices: sessionConfig.allowedDegrees ?? null,
        allowedMidis,
      });

      return { phrase, melodyRhythm: fabric };
    }

    // RANDOM (and other non-sequence/non-interval fallbacks)
    const fabric = buildTwoBarRhythm({
      bpm, den: ts.den, tsNum: ts.num,
      available,
      restProb: contentRestProb,
      allowRests: contentAllowRests,
      seed: rhythmSeed,
      bars: lengthBars,
    });

    // Build an allowed MIDI whitelist for RANDOM mode that optionally drops the top-octave tonic(s)
    const buildAllowedMidiWhitelist = (): number[] | null => {
      if (!tonicMidisSafe?.length) return null;

      const a4 = 440;
      const loM = Math.round(hzToMidi(Math.min(lowHz as number, highHz as number), a4));
      const hiM = Math.round(hzToMidi(Math.max(lowHz as number, highHz as number), a4));

      const sortedT = Array.from(new Set(tonicMidisSafe.map((t) => Math.round(t)))).sort((a, b) => a - b);
      const windows = sortedT.map((T) => [T, T + 12] as const);

      const minStart = windows[0][0];
      const maxEnd = windows[windows.length - 1][1];

      const inAny = (m: number) => windows.some(([s, e]) => m >= s && m <= e);
      const underOk = !!randomIncludeUnder ? (m: number) => m < minStart : () => false;
      const overOk  = !!randomIncludeOver  ? (m: number) => m > maxEnd  : () => false;

      let allowed: number[] = [];
      for (let m = loM; m <= hiM; m++) {
        const pc = ((m % 12) + 12) % 12;
        if (!isInScale(pc, scale.tonicPc, scale.name as any)) continue;
        if (inAny(m) || underOk(m) || overOk(m)) allowed.push(m);
      }

      // Treat [T, T+12) as half-open unless explicitly disabled
      if (dropUpperWindowDegrees !== false) {
        const upperTonics = new Set(sortedT.map((T) => T + 12));
        allowed = allowed.filter((m) => !upperTonics.has(m));
      }

      // Respect legacy whitelist if present by intersecting
      if (Array.isArray(allowedMidis) && allowedMidis.length) {
        const allowSet = new Set(allowedMidis.map((x) => Math.round(x)));
        allowed = allowed.filter((m) => allowSet.has(m));
      }

      return allowed.length ? allowed : null;
    };

    const allowedMidisForRandom = buildAllowedMidiWhitelist();

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
      tonicMidis: tonicMidisSafe,
      includeUnder: !!randomIncludeUnder,
      includeOver: !!randomIncludeOver,
      /** degree filter */
      allowedDegreeIndices: sessionConfig.allowedDegrees ?? null,
      // NEW: whitelist that enforces dropUpperWindowDegrees unless explicitly disabled
      allowedMidis: allowedMidisForRandom ?? allowedMidis ?? null,
      dropUpperWindowDegrees,
    });

    return { phrase, melodyRhythm: fabric };
  }, [
    customPhrase, haveRange, lowHz, highHz, bpm, ts.den, ts.num,
    scale, rhythm, rhythmSeed, scaleSeed, lengthBars,
    tonicMidisSafe, allowedMidis, randomIncludeUnder, randomIncludeOver,
    contentAllowRests, contentRestProb, sessionConfig.allowedDegrees,
    dropUpperWindowDegrees,
  ]);

  const phrase = generated.phrase;

  // lyrics
  const words: string[] | null = React.useMemo(() => {
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

  const keySig: string | null = React.useMemo(() => {
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
