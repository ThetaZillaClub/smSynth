// components/training/TrainingGame.tsx
"use client";
import React, { useMemo } from "react";
import GameLayout from "./layout/GameLayout";
import TrainingSessionPanel from "./layout/session/TrainingSessionPanel";

import usePitchDetection from "@/hooks/pitch/usePitchDetection";
import useWavRecorder from "@/hooks/audio/useWavRecorder";
import useRecorderAutoSync from "@/hooks/audio/useRecorderAutoSync";
import useTakeProcessing from "@/hooks/audio/useTakeProcessing";
import usePracticeLoop from "@/hooks/gameplay/usePracticeLoop";
import useStudentRow from "@/hooks/students/useStudentRow";
import useStudentRange from "@/hooks/students/useStudentRange";

import { secondsPerBeat, beatsToSeconds, barsToBeats, noteValueToBeats } from "@/utils/time/tempo";
import type { Phrase } from "@/utils/piano-roll/scale";
import { type SessionConfig, DEFAULT_SESSION_CONFIG } from "./layout/session/types";

import {
  buildPhraseFromScaleWithRhythm,
  buildTwoBarRhythm,
  buildPhraseFromScaleSequence,
  sequenceNoteCountForScale,
  buildBarsRhythmForQuota,
  type RhythmEvent,
} from "@/utils/phrase/generator";

import { makeSolfegeLyrics } from "@/utils/lyrics/solfege";

type Props = {
  title?: string;
  studentId?: string | null;
  sessionConfig?: SessionConfig;
};

const MAX_TAKES = 24;
const MAX_SESSION_SEC = 15 * 60;
const CONF_THRESHOLD = 0.5;

const rand32 = () => (Math.floor(Math.random() * 0xffffffff) >>> 0);

export default function TrainingGame({
  title = "Training",
  studentId = null,
  sessionConfig = DEFAULT_SESSION_CONFIG,
}: Props) {
  const { studentRowId, studentName, genderLabel } = useStudentRow({ studentIdFromQuery: studentId });
  const { lowHz, highHz, loading: rangeLoading, error: rangeError } = useStudentRange(studentRowId);

  // Fixed step flow now: no range capture step inside the game
  const step: "play" = "play";

  const {
    bpm, ts, leadBars, restBars,
    noteValue, noteDurSec, lyricStrategy,
    customPhrase, customWords,
    scale, rhythm,
  } = sessionConfig;

  /* ----------------------- Transport math ----------------------- */
  const secPerBeat = secondsPerBeat(bpm, ts.den);
  const leadBeats = barsToBeats(leadBars, ts.num);
  const leadInSec = beatsToSeconds(leadBeats, bpm, ts.den);
  const restBeats = barsToBeats(restBars, ts.num);
  const restSec = beatsToSeconds(restBeats, bpm, ts.den);

  /* ----------------------- Pitch engine ------------------------- */
  const { pitch, confidence, isReady, error } = usePitchDetection("/models/swiftf0", {
    enabled: true,
    fps: 50,
    minDb: -45,
    smoothing: 2,
    centsTolerance: 3,
  });
  const liveHz = typeof pitch === "number" ? pitch : null;

  const usingOverrides = !!customPhrase || !!customWords;
  const haveRange = lowHz != null && highHz != null;

  // session-scoped random seeds (don’t expose in UI)
  const rhythmSeed = useMemo(() => rand32(), []);
  const scaleSeed  = useMemo(() => rand32(), []);
  const syncSeed   = useMemo(() => rand32(), []);

  /* -------------------- Sync line rhythm ONLY -------------------- */
  const syncRhythmFabric: RhythmEvent[] | null = useMemo(() => {
    if (!rhythm) return null;

    const available =
      (rhythm as any).available?.length ? (rhythm as any).available : ["quarter"];

    const allowRests: boolean = (rhythm as any).allowRests !== false; // rhythm-line rests
    const restProbRaw = (rhythm as any).restProb ?? 0.3;
    const restProb = allowRests ? restProbRaw : 0;

    if ((rhythm as any).mode === "sequence") {
      const base = sequenceNoteCountForScale((scale?.name ?? "major") as any);
      const want =
        ((rhythm as any).pattern === "asc-desc" || (rhythm as any).pattern === "desc-asc")
          ? base * 2 - 1
          : base;

      return buildBarsRhythmForQuota({
        bpm, den: ts.den, tsNum: ts.num,
        available,
        restProb,
        allowRests,
        seed: syncSeed,
        noteQuota: want,
      });
    } else {
      return buildTwoBarRhythm({
        bpm, den: ts.den, tsNum: ts.num,
        available,
        restProb,
        allowRests,
        seed: syncSeed,
      });
    }
  }, [rhythm, bpm, ts.den, ts.num, scale?.name, syncSeed]);

  /* ------------------ Phrase generation (content) ------------------ */
  const generatedPhrase: Phrase | null = useMemo(() => {
    if (usingOverrides) return customPhrase ?? null;
    if (!haveRange || !scale || !rhythm) return null;

    const available =
      (rhythm as any).available?.length ? (rhythm as any).available : ["quarter"];

    // separate "phrase" (scale) rest controls
    const contentAllowRests: boolean = (rhythm as any).contentAllowRests !== false;
    const contentRestProbRaw = (rhythm as any).contentRestProb ?? 0.3;
    const contentRestProb = contentAllowRests ? contentRestProbRaw : 0;

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

      return buildPhraseFromScaleSequence({
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
      });
    } else {
      const fabric = buildTwoBarRhythm({
        bpm, den: ts.den, tsNum: ts.num,
        available,
        restProb: contentRestProb,
        allowRests: contentAllowRests,
        seed: rhythmSeed,
      });

      return buildPhraseFromScaleWithRhythm({
        lowHz: lowHz as number,
        highHz: highHz as number,
        a4Hz: 440,
        bpm, den: ts.den,
        tonicPc: scale.tonicPc,
        scale: scale.name,
        rhythm: fabric,
        maxPerDegree: scale.maxPerDegree ?? 2,
        seed: scaleSeed,
      });
    }
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
  ]);

  /* --------------- Phrase selection + lyrics ---------------- */
  const phrase: Phrase | null = useMemo(() => {
    if (customPhrase) return customPhrase;
    if (generatedPhrase) return generatedPhrase;
    return null;
  }, [customPhrase, generatedPhrase]);

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
      return makeSolfegeLyrics(
        phrase,
        scale.tonicPc,
        scale.name as any,
        { chromaticStyle: "auto", caseStyle: "lower" }
      );
    }
    return null;
  }, [customWords, phrase, lyricStrategy, scale]);

  /* ---------------- Recorder + loop orchestration ---------------- */
  const {
    isRecording, start: startRec, stop: stopRec,
    wavBlob, startedAtMs, sampleRateOut, pcm16k
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

  const lastEndSec =
    phrase?.notes?.length
      ? phrase.notes.reduce((mx, n) => Math.max(mx, n.startSec + n.durSec), 0)
      : phraseSec;

  const padSec = Math.max(0.08, secPerBeat * 0.15);
  const recordWindowSec = lastEndSec + padSec;

  const loop = usePracticeLoop({
    step, // always "play"
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
    onAdvancePhrase: () => {},
    onEnterPlay: () => {},
  });

  useRecorderAutoSync({
    enabled: step === "play",
    shouldRecord: loop.shouldRecord,
    isRecording,
    startRec,
    stopRec,
  });

  useTakeProcessing({
    wavBlob,
    sampleRateOut,
    pcm16k,
    windowOnSec: recordWindowSec,
    trimHeadSec: 0,
    onTakeReady: ({ exactBlob, exactSamples }) => {
      console.log("[musicianship] take ready", {
        studentRowId,
        studentName,
        genderLabel,
        bpm,
        ts: `${ts.num}/${ts.den}`,
        leadBars,
        restBars,
        exportSeconds: recordWindowSec,
        restSeconds: restSec,
        sampleRateOut: sampleRateOut || 16000,
        exactSamples,
        wavBytesRaw: (wavBlob as Blob)?.size,
        wavBytesExact: exactBlob.size,
      });
    },
  });

  const showLyrics = step === "play" && !!words?.length;
  const startMs = isRecording ? startedAtMs ?? null : null;

  const readinessError =
    rangeError
      ? `Range load failed: ${rangeError}`
      : !rangeLoading && !haveRange
        ? "No saved range found. Please set your vocal range first."
        : null;

  return (
    <GameLayout
      title={title}
      error={error || readinessError}
      running={loop.running && haveRange && !!phrase}
      onToggle={loop.toggle}
      phrase={phrase ?? undefined}
      lyrics={showLyrics ? words ?? undefined : undefined}
      livePitchHz={liveHz}
      confidence={confidence}
      confThreshold={CONF_THRESHOLD}
      startAtMs={startMs}
      leadInSec={leadInSec}
      isReady={isReady && haveRange && !!phrase}
      step={step}
      loopPhase={loop.loopPhase}
      rhythm={syncRhythmFabric ?? undefined}
      bpm={bpm}
      den={ts.den}
    >
      {haveRange && phrase && (
        <TrainingSessionPanel
          statusText={loop.statusText}
          isRecording={isRecording}
          startedAtMs={startedAtMs ?? null}
          recordSec={leadInSec + recordWindowSec}
          restSec={restSec}
          maxTakes={MAX_TAKES}
          maxSessionSec={MAX_SESSION_SEC}
          bpm={bpm}
          ts={ts}
          leadBars={leadBars}
          restBars={restBars}
        />
      )}
    </GameLayout>
  );
}
