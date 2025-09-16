// app/training/page.tsx
"use client";

import React from "react";
import { useSearchParams } from "next/navigation";

import GameLayout from "@/components/game-layout/GameLayout";
import RangeCapture from "@/components/game-layout/range/RangeCapture";
import TrainingSessionPanel from "@/components/game-layout/TrainingSessionPanel";

// pitch
import usePitchDetection from "@/hooks/pitch/usePitchDetection";
import usePitchReadout from "@/hooks/pitch/usePitchReadout";

// lyrics
import usePhraseLyrics from "@/hooks/lyrics/usePhraseLyrics";
import useActiveLyricIndex from "@/hooks/lyrics/useActiveLyricIndex";

// audio
import useWavRecorder from "@/hooks/audio/useWavRecorder";
import useRecorderAutoSync from "@/hooks/audio/useRecorderAutoSync";
import useTakeProcessing from "@/hooks/audio/useTakeProcessing";

// gameplay / timing / students / range
import usePracticeLoop from "@/hooks/gameplay/usePracticeLoop";
import usePracticeWindows from "@/hooks/timing/usePracticeWindows";
import useUiRecordTimer from "@/hooks/timing/useUiRecordTimer";
import useStudentRow from "@/hooks/students/useStudentRow";
import useStudentRangeUpdater from "@/hooks/students/useStudentRangeUpdater";
import useRangeSteps from "@/hooks/range/useRangeSteps";

const TRAIN_LEAD_IN_SEC = 1.0;
const NOTE_DUR_SEC = 0.5;
const MAX_TAKES = 24;
const MAX_SESSION_SEC = 15 * 60;
const CONF_THRESHOLD = 0.5;

export default function Training() {
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
  const { step, setStep, lowHz, highHz, canPlay, confirmLow, confirmHigh } = useRangeSteps({
    updateRange,
    a4Hz: 440,
  });

  // pitch engine + readouts
  const { pitch, confidence, isReady, error } = usePitchDetection("/models/swiftf0", {
    enabled: true,
    fps: 50,
    minDb: -45,
    smoothing: 2,
    centsTolerance: 3,
  });
  const { micText, pitchText, noteText } = usePitchReadout({
    pitch: typeof pitch === "number" ? pitch : null,
    isReady,
    error,
    a4Hz: 440,
  });

  // phrase & lyrics
  const { phrase, words, reset: resetPhraseLyrics, advance: advancePhraseLyrics } =
    usePhraseLyrics({ lowHz, highHz, lyricStrategy: "mixed", noteDurSec: NOTE_DUR_SEC });

  // recorder + UI timer
  const { isRecording, start: startRec, stop: stopRec, wavBlob, startedAtMs, sampleRateOut, pcm16k } =
    useWavRecorder({ sampleRateOut: 16000 });
  const uiRecordSec = useUiRecordTimer(isRecording, startedAtMs ?? null);

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

  // active lyric highlight
  const { activeIndex, setActiveIndex } = useActiveLyricIndex({
    step,
    loopPhase: loop.loopPhase,
  });

  return (
    <GameLayout
      title="Training"
      micText={micText}
      error={error}
      running={loop.running}
      uiRunning={loop.looping}
      onToggle={loop.toggle}
      phrase={phrase ?? undefined}
      lyrics={step === "play" && words ? words : undefined}
      activeLyricIndex={step === "play" ? activeIndex : -1}
      onActiveNoteChange={(idx) => setActiveIndex(idx)}
      pitchText={pitchText}
      noteText={noteText}
      confidence={confidence}
      livePitchHz={typeof pitch === "number" ? pitch : null}
      confThreshold={CONF_THRESHOLD}
      startAtMs={isRecording ? startedAtMs ?? null : null}
      leadInSec={TRAIN_LEAD_IN_SEC}
    >
      {step === "low" && (
        <RangeCapture
          mode="low"
          active
          pitchHz={typeof pitch === "number" ? pitch : null}
          bpm={60}
          beatsRequired={1}
          centsWindow={75}
          a4Hz={440}
          onConfirm={confirmLow}
        />
      )}

      {step === "high" && (
        <RangeCapture
          mode="high"
          active
          pitchHz={typeof pitch === "number" ? pitch : null}
          bpm={60}
          beatsRequired={1}
          centsWindow={75}
          a4Hz={440}
          onConfirm={confirmHigh}
        />
      )}

      {step === "play" && canPlay && (
        <TrainingSessionPanel
          statusText={loop.statusText}
          isRecording={isRecording}
          uiRecordSec={Math.min(uiRecordSec, windowOnSec)}
          recordSec={windowOnSec}
          restSec={windowOffSec}
          maxTakes={MAX_TAKES}
          maxSessionSec={MAX_SESSION_SEC}
        />
      )}
    </GameLayout>
  );
}
