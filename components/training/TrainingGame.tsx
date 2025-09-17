// components/game-layout/training/TrainingGame.tsx
"use client";

import React from "react";
import { useSearchParams } from "next/navigation";

import GameLayout from "./layout/GameLayout";
import RangeCapture from "./layout/range/RangeCapture";
import TrainingSessionPanel from "./layout/session/TrainingSessionPanel";

// hooks (unchanged locations)
import usePitchDetection from "@/hooks/pitch/usePitchDetection";
import usePhraseLyrics from "@/hooks/lyrics/usePhraseLyrics";
import useWavRecorder from "@/hooks/audio/useWavRecorder";
import useRecorderAutoSync from "@/hooks/audio/useRecorderAutoSync";
import useTakeProcessing from "@/hooks/audio/useTakeProcessing";
import usePracticeLoop from "@/hooks/gameplay/usePracticeLoop";
import usePracticeWindows from "@/hooks/timing/usePracticeWindows";
import useStudentRow from "@/hooks/students/useStudentRow";
import useStudentRangeUpdater from "@/hooks/students/useStudentRangeUpdater";
import useRangeSteps from "./layout/range/useRangeSteps";

type Props = {
  title?: string;
};

const TRAIN_LEAD_IN_SEC = 1.0;
const NOTE_DUR_SEC = 0.5;
const MAX_TAKES = 24;
const MAX_SESSION_SEC = 15 * 60;
const CONF_THRESHOLD = 0.5;

export default function TrainingGame({ title = "Training" }: Props) {
  const searchParams = useSearchParams();

  // Still reading from ?model_id until backend is renamed
  const studentIdFromQuery = searchParams.get("model_id") || null;

  // time windows (parse once from URL)
  const { windowOnSec, windowOffSec } = usePracticeWindows({
    searchParams,
    defaultOn: 8,
    defaultOff: 8,
    min: 1,
    max: 120,
  });

  // student row & range label updater (front-end naming only)
  const { studentRowId, studentName, genderLabel } = useStudentRow({ studentIdFromQuery });
  const updateRange = useStudentRangeUpdater(studentRowId);

  // steps + range confirmations
  const { step, lowHz, highHz, canPlay, confirmLow, confirmHigh } = useRangeSteps({
    updateRange,
    a4Hz: 440,
  });

  // pitch engine
  const { pitch, confidence, isReady, error } = usePitchDetection("/models/swiftf0", {
    enabled: true,
    fps: 50,
    minDb: -45,
    smoothing: 2,
    centsTolerance: 3,
  });
  const liveHz = typeof pitch === "number" ? pitch : null;

  // phrase & lyrics
  const { phrase, words, reset: resetPhraseLyrics, advance: advancePhraseLyrics } =
    usePhraseLyrics({ lowHz, highHz, lyricStrategy: "mixed", noteDurSec: NOTE_DUR_SEC });

  // recorder
  const {
    isRecording,
    start: startRec,
    stop: stopRec,
    wavBlob,
    startedAtMs,
    sampleRateOut,
    pcm16k,
  } = useWavRecorder({ sampleRateOut: 16000 });

  // loop state machine
  const loop = usePracticeLoop({
    step,
    lowHz,
    highHz,
    phrase,
    words,
    windowOnSec,
    windowOffSec,
    maxTakes: MAX_TAKES,
    maxSessionSec: MAX_SESSION_SEC,
    isRecording,
    startedAtMs: startedAtMs ?? null,
    onAdvancePhrase: advancePhraseLyrics,
    onEnterPlay: resetPhraseLyrics,
  });

  // start/stop recorder based on loop intent
  useRecorderAutoSync({
    enabled: step === "play",
    shouldRecord: loop.shouldRecord,
    isRecording,
    startRec,
    stopRec,
  });

  // per-take WAV post-processing
  useTakeProcessing({
    wavBlob,
    sampleRateOut,
    pcm16k,
    windowOnSec,
    onTakeReady: ({ exactBlob, exactSamples }) => {
      // eslint-disable-next-line no-console
      console.log("[musicianship] take ready", {
        studentRowId,
        studentName,
        genderLabel,
        windowOnSec,
        windowOffSec,
        sampleRateOut: sampleRateOut || 16000,
        exactSamples,
        wavBytesRaw: (wavBlob as Blob)?.size,
        wavBytesExact: exactBlob.size,
      });
    },
  });

  // ---------- view-model bits ----------
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
      uiRunning={loop.looping}
      onToggle={loop.toggle}
      phrase={phrase ?? undefined}
      lyrics={showLyrics ? words : undefined}
      livePitchHz={liveHz}
      confidence={confidence}
      confThreshold={CONF_THRESHOLD}
      startAtMs={startMs}
      leadInSec={TRAIN_LEAD_IN_SEC}
      /** For internal hooks */
      isReady={isReady}
      step={step}
      loopPhase={loop.loopPhase}
    >
      {isRangeStep && (
        <RangeCapture
          mode={step as "low" | "high"}
          active
          pitchHz={liveHz}
          bpm={60}
          beatsRequired={1}
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
          recordSec={windowOnSec}
          restSec={windowOffSec}
          maxTakes={MAX_TAKES}
          maxSessionSec={MAX_SESSION_SEC}
        />
      )}
    </GameLayout>
  );
}
