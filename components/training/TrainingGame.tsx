// components/training/TrainingGame.tsx
"use client";

import React, { useMemo } from "react";

import GameLayout from "./layout/GameLayout";
import RangeCapture from "./layout/range/RangeCapture";
import TrainingSessionPanel from "./layout/session/TrainingSessionPanel";

import usePitchDetection from "@/hooks/pitch/usePitchDetection";
import usePhraseLyrics from "@/hooks/lyrics/usePhraseLyrics";
import useWavRecorder from "@/hooks/audio/useWavRecorder";
import useRecorderAutoSync from "@/hooks/audio/useRecorderAutoSync";
import useTakeProcessing from "@/hooks/audio/useTakeProcessing";
import usePracticeLoop from "@/hooks/gameplay/usePracticeLoop";
import useStudentRow from "@/hooks/students/useStudentRow";
import useStudentRangeUpdater from "@/hooks/students/useStudentRangeUpdater";
import useRangeSteps from "./layout/range/useRangeSteps";

import { secondsPerBeat, beatsToSeconds, barsToBeats, noteValueToBeats } from "@/utils/time/tempo";
import type { Phrase } from "@/utils/piano-roll/scale";
import { type SessionConfig, DEFAULT_SESSION_CONFIG } from "./layout/session/types";
import {
  buildPhraseFromScaleWithRhythm,
  buildTwoBarRhythm,
  buildPhraseFromScaleSequence,
  sequenceNoteCountForScale,
  buildBarsRhythmForQuota, // NEW
} from "@/utils/phrase/generator";
import { makeWordLyricVariant } from "@/utils/lyrics/wordBank";

type Props = {
  title?: string;
  studentId?: string | null;
  sessionConfig?: SessionConfig;
};

const MAX_TAKES = 24;
const MAX_SESSION_SEC = 15 * 60;
const CONF_THRESHOLD = 0.5;

export default function TrainingGame({
  title = "Training",
  studentId = null,
  sessionConfig = DEFAULT_SESSION_CONFIG,
}: Props) {
  const { studentRowId, studentName, genderLabel } = useStudentRow({ studentIdFromQuery: studentId });
  const updateRange = useStudentRangeUpdater(studentRowId);

  const { step, lowHz, highHz, canPlay, confirmLow, confirmHigh } = useRangeSteps({ updateRange, a4Hz: 440 });

  const {
    bpm, ts, leadBars, restBars,
    noteValue, noteDurSec, lyricStrategy,
    customPhrase, customWords,
    scale, rhythm,
  } = sessionConfig;

  // Transport math (lead-in derived from bars)
  const secPerBeat = secondsPerBeat(bpm, ts.den);
  const leadBeats = barsToBeats(leadBars, ts.num);
  const leadInSec = beatsToSeconds(leadBeats, bpm, ts.den);
  const restBeats = barsToBeats(restBars, ts.num);
  const restSec = beatsToSeconds(restBeats, bpm, ts.den);

  // Pitch engine
  const { pitch, confidence, isReady, error } = usePitchDetection("/models/swiftf0", {
    enabled: true,
    fps: 50,
    minDb: -45,
    smoothing: 2,
    centsTolerance: 3,
  });
  const liveHz = typeof pitch === "number" ? pitch : null;

  const usingOverrides = !!customPhrase || !!customWords;

  // Build phrase according to rhythm config (sequence can exceed 2 bars now)
  const generatedPhrase: Phrase | null = useMemo(() => {
    if (usingOverrides) return customPhrase ?? null;
    if (!lowHz || !highHz || !scale || !rhythm) return null;

    const available = (rhythm as any).available?.length ? (rhythm as any).available : ["quarter"];
    const restProb = (rhythm as any).restProb ?? 0.3;
    const seed = (rhythm as any).seed ?? 0xA5F3D7;

    if ((rhythm as any).mode === "sequence") {
      // Determine how many scale targets we need
      const base = sequenceNoteCountForScale(scale.name);
      const want =
        ((rhythm as any).pattern === "asc-desc" || (rhythm as any).pattern === "desc-asc")
          ? (base * 2 - 1)   // don't double-count the apex/valley
          : base;

      // Build *as many bars as needed* to deliver EXACTLY `want` NOTE slots
      const fabric = buildBarsRhythmForQuota({
        bpm, den: ts.den, tsNum: ts.num,
        available,
        restProb,
        seed,
        noteQuota: want,
      });

      return buildPhraseFromScaleSequence({
        lowHz, highHz, a4Hz: 440,
        bpm, den: ts.den,
        tonicPc: scale.tonicPc,
        scale: scale.name,
        rhythm: fabric,
        pattern: (rhythm as any).pattern,
        noteQuota: want,
        seed,
      });
    } else {
      // random: 2-bar rhythm, then stepwise-ish scale phrase using soft caps
      const fabric = buildTwoBarRhythm({
        bpm, den: ts.den, tsNum: ts.num,
        available,
        restProb,
        seed,
      });
      return buildPhraseFromScaleWithRhythm({
        lowHz, highHz, a4Hz: 440,
        bpm, den: ts.den,
        tonicPc: scale.tonicPc,
        scale: scale.name,
        rhythm: fabric,
        maxPerDegree: scale.maxPerDegree ?? 2,
        seed: scale.seed ?? 0x9E3779B9,
      });
    }
  }, [usingOverrides, customPhrase, lowHz, highHz, bpm, ts.den, ts.num, scale, rhythm]);

  // Legacy fallback (kept for safety)
  const {
    phrase: genPhraseLegacy,
    words: genWordsLegacy,
    reset: resetPhraseLyrics,
    advance: advancePhraseLyrics,
  } = usePhraseLyrics({
    lowHz,
    highHz,
    lyricStrategy,
    a4Hz: 440,
    noteDurSec:
      typeof noteValue === "string"
        ? beatsToSeconds(noteValueToBeats(noteValue, ts.den), bpm, ts.den)
        : (noteDurSec ?? secPerBeat),
  });

  const phrase: Phrase | null = useMemo(() => {
    if (customPhrase) return customPhrase;
    if (generatedPhrase) return generatedPhrase;
    return genPhraseLegacy ?? null;
  }, [customPhrase, generatedPhrase, genPhraseLegacy]);

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
    if (generatedPhrase) {
      const n = generatedPhrase.notes.length || 0;
      return makeWordLyricVariant(n, lyricStrategy, 0xABCD1234);
    }
    return genWordsLegacy ?? null;
  }, [customWords, phrase, generatedPhrase, lyricStrategy, genWordsLegacy]);

  // Recorder + loop
  const { isRecording, start: startRec, stop: stopRec, wavBlob, startedAtMs, sampleRateOut, pcm16k } =
    useWavRecorder({ sampleRateOut: 16000 });

  const genNoteDurSec =
    typeof noteValue === "string"
      ? beatsToSeconds(noteValueToBeats(noteValue, ts.den), bpm, ts.den)
      : (noteDurSec ?? secPerBeat);

  const phraseSec =
    phrase?.durationSec && Number.isFinite(phrase.durationSec)
      ? phrase.durationSec
      : // fallback: was 2 bars; keep as last-resort only
        beatsToSeconds(2 * ts.num, bpm, ts.den) ?? genNoteDurSec * 8;

  const totalTakeSec = leadInSec + phraseSec;

  const loop = usePracticeLoop({
    step,
    lowHz,
    highHz,
    phrase,
    words,
    windowOnSec: totalTakeSec,
    windowOffSec: restSec,
    maxTakes: MAX_TAKES,
    maxSessionSec: MAX_SESSION_SEC,
    isRecording,
    startedAtMs: startedAtMs ?? null,
    onAdvancePhrase: usingOverrides ? () => {} : generatedPhrase ? () => {} : advancePhraseLyrics,
    onEnterPlay: usingOverrides ? () => {} : generatedPhrase ? () => {} : resetPhraseLyrics,
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
    windowOnSec: phraseSec,
    trimHeadSec: leadInSec,
    onTakeReady: ({ exactBlob, exactSamples }) => {
      console.log("[musicianship] take ready", {
        studentRowId,
        studentName,
        genderLabel,
        bpm,
        ts: `${ts.num}/${ts.den}`,
        leadBars,
        restBars,
        exportSeconds: phraseSec,
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

  const isRangeStep = step === "low" || step === "high";
  const rangeConfirm = step === "low" ? confirmLow : confirmHigh;
  const showSessionPanel = step === "play" && canPlay;

  return (
    <GameLayout
      title={title}
      error={error}
      running={loop.running}
      onToggle={loop.toggle}
      phrase={phrase ?? undefined}
      lyrics={showLyrics ? words ?? undefined : undefined}
      livePitchHz={liveHz}
      confidence={confidence}
      confThreshold={CONF_THRESHOLD}
      startAtMs={startMs}
      leadInSec={leadInSec}
      isReady={isReady}
      step={step}
      loopPhase={loop.loopPhase}
    >
      {isRangeStep && (
        <RangeCapture
          key={`range-${step}`}
          mode={step as "low" | "high"}
          active
          pitchHz={liveHz}
          holdSec={1}
          centsWindow={75}
          a4Hz={440}
          onConfirm={rangeConfirm}
        />
      )}

      {showSessionPanel && (
        <TrainingSessionPanel
          statusText={loop.statusText}
          isRecording={isRecording}
          startedAtMs={startedAtMs ?? null}
          recordSec={totalTakeSec}
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
