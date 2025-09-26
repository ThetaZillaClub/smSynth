// components/training/TrainingGame.tsx
"use client";
import React, { useMemo, useCallback, useRef, useState, useEffect } from "react";
import GameLayout from "./layout/GameLayout";
import { SessionPanel, PretestPanel } from "./session";
import usePitchDetection from "@/hooks/pitch/usePitchDetection";
import useWavRecorder from "@/hooks/audio/useWavRecorder";
import useRecorderAutoSync from "@/hooks/audio/useRecorderAutoSync";
import usePracticeLoop from "@/hooks/gameplay/usePracticeLoop";
import useStudentRange from "@/hooks/students/useStudentRange";
import usePhrasePlayer from "@/hooks/audio/usePhrasePlayer";
import {
  secondsPerBeat,
  beatsToSeconds,
  barsToBeats,
  noteValueToBeats,
} from "@/utils/time/tempo";
import type { Phrase } from "@/utils/stage";
import { type SessionConfig, DEFAULT_SESSION_CONFIG } from "./session";
import {
  buildPhraseFromScaleWithRhythm,
  buildTwoBarRhythm,
  buildPhraseFromScaleSequence,
  sequenceNoteCountForScale,
  buildBarsRhythmForQuota,
  buildIntervalPhrase,
  type RhythmEvent,
} from "@/utils/phrase/generator";
import { makeSolfegeLyrics } from "@/utils/lyrics/solfege";
import { keyNameFromTonicPc, pickClef } from "./layout/stage/sheet/vexscore/builders";
import usePretest from "@/hooks/gameplay/usePretest";
import { hzToMidi } from "@/utils/pitch/pitchMath";
import { isInScale } from "@/utils/phrase/scales";

type Props = {
  title?: string;
  studentId?: string | null;
  sessionConfig?: SessionConfig;
  studentRowId?: string | null;
  studentName?: string | null;
  genderLabel?: "male" | "female" | null;
  rangeLowLabel?: string | null;
  rangeHighLabel?: string | null;
};

const CONF_THRESHOLD = 0.5;
const rand32 = () => (Math.floor(Math.random() * 0xffffffff) >>> 0);

export default function TrainingGame({
  title = "Training",
  studentId = null,
  sessionConfig = DEFAULT_SESSION_CONFIG,
  studentRowId = null,
  studentName = null,
  genderLabel = null,
  rangeLowLabel = null,
  rangeHighLabel = null,
}: Props) {
  const {
    lowHz,
    highHz,
    loading: rangeLoading,
    error: rangeError,
  } = useStudentRange(studentRowId, { rangeLowLabel, rangeHighLabel });

  const step: "play" = "play";
  const {
    bpm,
    ts,
    leadBars,
    restBars,
    noteValue,
    noteDurSec,
    lyricStrategy,
    customPhrase,
    customWords,
    scale,
    rhythm,
    view,
    exerciseBars,
    callResponseSequence,
    exerciseLoops,
    regenerateBetweenTakes,
    metronome,
  } = sessionConfig;

  const secPerBeat = secondsPerBeat(bpm, ts.den);
  const secPerBar = ts.num * secPerBeat;
  const leadBeats = barsToBeats(leadBars, ts.num);
  const leadInSec = beatsToSeconds(leadBeats, bpm, ts.den);
  const restBeats = barsToBeats(restBars, ts.num);
  const restSec = beatsToSeconds(restBeats, bpm, ts.den);
  const MAX_TAKES = Math.max(1, Number(exerciseLoops ?? 24));
  const MAX_SESSION_SEC = 15 * 60;

  const { pitch, confidence, isReady, error } = usePitchDetection("/models/swiftf0", {
    enabled: true,
    fps: 50,
    minDb: -45,
    smoothing: 2,
    centsTolerance: 3,
  });
  const liveHz = typeof pitch === "number" ? pitch : null;

  // regeneration seed between takes
  const [seedBump, setSeedBump] = useState(0);

  const usingOverrides = !!customPhrase || !!customWords;
  const haveRange = lowHz != null && highHz != null;
  const rhythmSeed = useMemo(() => rand32(), [seedBump]);
  const scaleSeed = useMemo(() => rand32(), [seedBump]);
  const syncSeed = useMemo(() => rand32(), [seedBump]);
  const lengthBars = Math.max(1, Number((rhythm as any)?.lengthBars ?? exerciseBars ?? 2));

  /* -----------------------------------------------------------
   * Derive *line* and *content* rest policies from rhythm config
   * -----------------------------------------------------------
   * - lineAllowRests / lineRestProb drive the blue rhythm line
   * - contentAllowRests / contentRestProb drive the MELODY fabric
   *   (defaults now *inherit* from the line settings)
   */
  const lineAllowRests: boolean = useMemo(
    () => (rhythm as any)?.allowRests !== false,
    [rhythm]
  );

  const lineRestProbRaw: number = useMemo(
    () => (rhythm as any)?.restProb ?? 0.3,
    [rhythm]
  );
  const lineRestProb: number = useMemo(
    () => (lineAllowRests ? lineRestProbRaw : 0),
    [lineAllowRests, lineRestProbRaw]
  );

  // Melody/content defaults inherit from the line unless explicitly set
  const contentAllowRests: boolean = useMemo(() => {
    const v = (rhythm as any)?.contentAllowRests;
    return v == null ? lineAllowRests : v !== false;
  }, [rhythm, lineAllowRests]);

  const contentRestProbRaw: number = useMemo(() => {
    const v = (rhythm as any)?.contentRestProb;
    return v == null ? lineRestProbRaw : v;
  }, [rhythm, lineRestProbRaw]);

  const contentRestProb: number = useMemo(
    () => (contentAllowRests ? contentRestProbRaw : 0),
    [contentAllowRests, contentRestProbRaw]
  );

  /* ------------------------ BLUE RHYTHM LINE (sync) ------------------------ */
  const syncRhythmFabric: RhythmEvent[] | null = useMemo(() => {
    if (!rhythm) return null;
    const lineEnabled = (rhythm as any).lineEnabled !== false;
    if (!lineEnabled) return null;
    const available = (rhythm as any).available?.length ? (rhythm as any).available : ["quarter"];
    if ((rhythm as any).mode === "sequence") {
      const base = sequenceNoteCountForScale((scale?.name ?? "major") as any);
      const want =
        ((rhythm as any).pattern === "asc-desc" || (rhythm as any).pattern === "desc-asc")
          ? base * 2 - 1
          : base;
      return buildBarsRhythmForQuota({
        bpm,
        den: ts.den,
        tsNum: ts.num,
        available,
        restProb: lineRestProb,
        allowRests: lineAllowRests,
        seed: syncSeed,
        noteQuota: want,
      });
    } else {
      return buildTwoBarRhythm({
        bpm,
        den: ts.den,
        tsNum: ts.num,
        available,
        restProb: lineRestProb,
        allowRests: lineAllowRests,
        seed: syncSeed,
        bars: lengthBars,
      });
    }
  }, [
    rhythm,
    bpm,
    ts.den,
    ts.num,
    scale?.name,
    syncSeed,
    lengthBars,
    lineAllowRests,
    lineRestProb,
  ]);

  /* ------------------------ MELODY GENERATION ------------------------ */
  const generated = useMemo((): { phrase: Phrase | null; melodyRhythm: RhythmEvent[] | null } => {
    if (usingOverrides) return { phrase: customPhrase ?? null, melodyRhythm: null };
    if (!haveRange || !scale || !rhythm) return { phrase: null, melodyRhythm: null };

    const available = (rhythm as any).available?.length ? (rhythm as any).available : ["quarter"];

    if ((rhythm as any).mode === "interval") {
      // Interval training — respect contentAllowRests for gaps between pairs
      const phrase = buildIntervalPhrase({
        lowHz: lowHz as number,
        highHz: highHz as number,
        a4Hz: 440,
        bpm,
        den: ts.den,

        tonicPc: scale.tonicPc,
        scale: scale.name as any,

        intervals: (rhythm as any).intervals || [3, 5],
        numIntervals: (rhythm as any).numIntervals || 8,

        pairRhythm: [
          { type: "note", value: "quarter" },
          { type: "note", value: "quarter" },
        ],
        // If rests are disabled for content, don't insert gap rests
        gapRhythm: contentAllowRests ? [{ type: "rest", value: "eighth" }] : [],

        seed: scaleSeed,
        tonicMidis: sessionConfig.tonicMidis ?? null,
        allowedMidis: sessionConfig.allowedMidis ?? null,
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
        bpm,
        den: ts.den,
        tsNum: ts.num,
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
        bpm,
        den: ts.den,
        tonicPc: scale.tonicPc,
        scale: scale.name,
        rhythm: fabric,
        pattern: (rhythm as any).pattern,
        noteQuota: want,
        seed: scaleSeed,
        tonicMidis: sessionConfig.tonicMidis ?? null,
        allowedMidis: sessionConfig.allowedMidis ?? null,
      });
      return { phrase, melodyRhythm: fabric };
    }

    // Random/content rhythm — inherits rest policy from line unless explicitly overridden
    const fabric = buildTwoBarRhythm({
      bpm,
      den: ts.den,
      tsNum: ts.num,
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
      bpm,
      den: ts.den,
      tonicPc: scale.tonicPc,
      scale: scale.name,
      rhythm: fabric,
      maxPerDegree: scale.maxPerDegree ?? 2,
      seed: scaleSeed,
      tonicMidis: sessionConfig.tonicMidis ?? null,
      includeUnder: !!sessionConfig.randomIncludeUnder,
      includeOver: !!sessionConfig.randomIncludeOver,
      allowedMidis: sessionConfig.allowedMidis ?? null,
    });
    return { phrase, melodyRhythm: fabric };
  }, [
    usingOverrides,
    customPhrase,
    haveRange,
    lowHz,
    highHz,
    bpm,
    ts.den,
    ts.num,
    scale,
    rhythm,
    rhythmSeed,
    scaleSeed,
    lengthBars,
    sessionConfig.tonicMidis,
    sessionConfig.allowedMidis,
    sessionConfig.randomIncludeUnder,
    sessionConfig.randomIncludeOver,
    contentAllowRests,
    contentRestProb,
  ]);

  const phrase: Phrase | null = useMemo(() => {
    if (customPhrase) return customPhrase;
    if (generated.phrase) return generated.phrase;
    return null;
  }, [customPhrase, generated]);

  const melodyRhythm: RhythmEvent[] | null = useMemo(
    () => generated.melodyRhythm ?? null,
    [generated]
  );

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

  const sheetKeySig: string | null = useMemo(() => {
    if (!scale) return null;
    // Use "fewest accidentals" normalization; prefer flats on neutral ties.
    return keyNameFromTonicPc(scale.tonicPc, scale.name as any, false);
  }, [scale]);

  // ----- Stable clef selection derived from the user’s *selected notes* (C4 boundary) -----
  const melodyClef: "treble" | "bass" | null = useMemo(() => {
    if (!scale || !haveRange) {
      return phrase ? pickClef(phrase) : null;
    }

    const a4 = 440;
    const loM = Math.round(hzToMidi(lowHz as number, a4));
    const hiM = Math.round(hzToMidi(highHz as number, a4));
    const lo = Math.min(loM, hiM);
    const hi = Math.max(loM, hiM);

    // 1) scale-filtered notes within saved range
    let allowed: number[] = [];
    for (let m = lo; m <= hi; m++) {
      const pc = ((m % 12) + 12) % 12;
      if (isInScale(pc, scale.tonicPc, scale.name as any)) allowed.push(m);
    }

    // 2) apply tonic windows (+under/over)
    const tWins = sessionConfig.tonicMidis ?? null;
    if (tWins && tWins.length) {
      const sorted = Array.from(new Set(tWins.map((x) => Math.round(x)))).sort((a, b) => a - b);
      const windows = sorted.map((T) => [T, T + 12] as const);
      const minStart = windows[0][0];
      const maxEnd = windows[windows.length - 1][1];
      const inAny = (m: number) => windows.some(([s, e]) => m >= s && m <= e);
      const underOk = !!sessionConfig.randomIncludeUnder ? (m: number) => m < minStart : () => false;
      const overOk  = !!sessionConfig.randomIncludeOver  ? (m: number) => m > maxEnd  : () => false;
      const filtered = allowed.filter((m) => inAny(m) || underOk(m) || overOk(m));
      if (filtered.length) allowed = filtered;
    }

    // 3) apply per-note whitelist
    const whitelist = sessionConfig.allowedMidis ?? null;
    if (whitelist && whitelist.length) {
      const allowSet = new Set(whitelist.map((m) => Math.round(m)));
      const filtered = allowed.filter((m) => allowSet.has(m));
      if (filtered.length) allowed = filtered;
    }

    if (!allowed.length) {
      return phrase ? pickClef(phrase) : "treble";
    }

    // 4) majority relative to C4 (MIDI 60). Tie → treble.
    const uniq = Array.from(new Set(allowed));
    const below = uniq.filter((m) => m < 60).length;
    const atOrAbove = uniq.length - below;
    return atOrAbove >= below ? "treble" : "bass";
  }, [
    scale,
    haveRange,
    lowHz,
    highHz,
    sessionConfig.tonicMidis,
    sessionConfig.randomIncludeUnder,
    sessionConfig.randomIncludeOver,
    sessionConfig.allowedMidis,
    phrase,
  ]);

  const {
    isRecording,
    start: startRec,
    stop: stopRec,
    startedAtMs,
  } = useWavRecorder({ sampleRateOut: 16000 });

  const genNoteDurSec =
    typeof noteValue === "string"
      ? beatsToSeconds(noteValueToBeats(noteValue, ts.den), bpm, ts.den)
      : (noteDurSec ?? secPerBeat);

  const fallbackPhraseSec =
    beatsToSeconds(2 * ts.num, bpm, ts.den) ?? genNoteDurSec * 8;

  const phraseSec =
    phrase?.durationSec && Number.isFinite(phrase.durationSec)
      ? phrase.durationSec
      : fallbackPhraseSec;

  const lastEndSec = phrase?.notes?.length
    ? phrase.notes.reduce((mx, n) => Math.max(mx, n.startSec + n.durSec), 0)
    : phraseSec;

  const recordWindowSec =
    Math.ceil(lastEndSec / Math.max(1e-9, secPerBar)) * secPerBar;

  const { playA440, playMidiList, playLeadInTicks } = usePhrasePlayer();

  // ------------------------ PRE-TEST ------------------------
  const pretest = usePretest({
    sequence: callResponseSequence ?? [],
    bpm,
    ts,
    scale: scale ?? { tonicPc: 0, name: "major" },
    lowHz: lowHz ?? null,
    highHz: highHz ?? null,
    player: {
      playA440: async (durSec) => { await playA440(durSec); },
      playMidiList: async (midi, noteDurSec) => { await playMidiList(midi, noteDurSec); },
    },
  });

  const [pretestDismissed, setPretestDismissed] = useState(false);
  const pretestActive =
    (callResponseSequence?.length ?? 0) > 0 &&
    !pretestDismissed &&
    pretest.status !== "done";

  // ------------------------ PRACTICE LOOP -------------------
  const loop = usePracticeLoop({
    step,
    lowHz: haveRange ? (lowHz as number) : null,
    highHz: haveRange ? (highHz as number) : null,
    phrase,
    words,
    windowOnSec: recordWindowSec,
    windowOffSec: restSec,
    preRollSec: leadInSec,
    maxTakes: MAX_TAKES,
    maxSessionSec: MAX_SESSION_SEC,
    isRecording,
    startedAtMs: startedAtMs ?? null,
    callResponse: false,
    callWindowSec: 0,
    onStartCall: undefined,
    onAdvancePhrase: () => {
      if (regenerateBetweenTakes) setSeedBump((n) => n + 1);
    },
    onEnterPlay: () => {},
  });

  // Recorder control
  const shouldRecord =
    (pretestActive && pretest.shouldRecord) || (!pretestActive && loop.shouldRecord);

  useRecorderAutoSync({
    enabled: step === "play",
    shouldRecord,
    isRecording,
    startRec,
    stopRec,
  });

  // ------------------------ METRONOME LEAD-IN (single-shot, anchor keyed) ----
  const scheduledLeadAnchorRef = useRef<number | null>(null);
  useEffect(() => {
    if (pretestActive) return;
    if (!metronome) return;
    if (leadBeats <= 0) return;
    if (loop.loopPhase !== "record") return;
    if (loop.anchorMs == null) return;

    if (scheduledLeadAnchorRef.current === loop.anchorMs) return;
    scheduledLeadAnchorRef.current = loop.anchorMs;

    void playLeadInTicks(leadBeats, secPerBeat, loop.anchorMs);
  }, [
    pretestActive,
    metronome,
    leadBeats,
    loop.loopPhase,
    loop.anchorMs,
    playLeadInTicks,
    secPerBeat,
  ]);

  const showLyrics = step === "play" && !!words?.length;
  const readinessError = rangeError
    ? `Range load failed: ${rangeError}`
    : !rangeLoading && !haveRange
    ? "No saved range found. Please set your vocal range first."
    : null;

  const running = pretestActive ? pretest.running : loop.running;
  const startAtMs = pretestActive ? pretest.anchorMs : loop.anchorMs;
  const statusText = pretestActive ? pretest.currentLabel : loop.statusText;

  return (
    <GameLayout
      title={title}
      error={error || readinessError}
      running={running}
      onToggle={loop.toggle}
      phrase={phrase ?? undefined}
      lyrics={showLyrics ? (words ?? undefined) : undefined}
      livePitchHz={liveHz}
      confidence={confidence}
      confThreshold={CONF_THRESHOLD}
      startAtMs={startAtMs}
      leadInSec={leadInSec}
      isReady={isReady && (!!phrase || pretestActive)}
      step={step}
      loopPhase={pretestActive ? "call" : loop.loopPhase}
      /* ✅ Always provide the same first-exercise fabrics */
      rhythm={syncRhythmFabric ?? undefined}
      melodyRhythm={melodyRhythm ?? undefined}
      bpm={bpm}
      den={ts.den}
      tsNum={ts.num}
      keySig={sheetKeySig}
      view={view}
      clef={melodyClef}
      lowHz={lowHz ?? null}
      highHz={highHz ?? null}
    >
      {/* Panels */}
      {pretestActive ? (
        <PretestPanel
          statusText={statusText}
          detail="Call & Response has no metronome lead-in. You’ll still see the full exercise on the stage."
          running={pretest.running}
          onStart={pretest.start}
          onContinue={pretest.continueResponse}
          onReset={pretest.reset}
        />
      ) : (
        phrase && (
          <SessionPanel
            statusText={statusText}
            isRecording={isRecording}
            startedAtMs={startAtMs}
            recordSec={leadInSec + recordWindowSec}
            restSec={restSec}
            maxTakes={MAX_TAKES}
            maxSessionSec={MAX_SESSION_SEC}
            bpm={bpm}
            ts={ts}
            leadBars={leadBars}
            restBars={restBars}
          />
        )
      )}

      {/* Minimal post-pretest confirm */}
      {!pretestActive && (callResponseSequence?.length ?? 0) > 0 && pretest.status === "done" && !pretestDismissed ? (
        <div className="mt-2 rounded-lg border border-[#d2d2d2] bg-[#ebebeb] p-3">
          ...
        </div>
      ) : null}
    </GameLayout>
  );
}
