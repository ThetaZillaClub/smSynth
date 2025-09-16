// app/training/page.tsx
"use client";

import React from "react";
import { useSearchParams } from "next/navigation";

import GameLayout from "@/components/game-layout/GameLayout";
import RangeCapture from "@/components/game-layout/range/RangeCapture";
import TrainingSessionPanel from "@/components/game-layout/TrainingSessionPanel";

import usePitchDetection from "@/hooks/usePitchDetection";
import useWavRecorder from "@/hooks/useWavRecorder";
import useUiRecordTimer from "@/hooks/training/useUiRecordTimer";
import usePhraseLyrics from "@/hooks/training/usePhraseLyrics";
import useTrainingModelRow from "@/hooks/training/useTrainingModelRow";
import useRangeUpdater from "@/hooks/training/useRangeUpdater";
import usePitchReadout from "@/hooks/training/usePitchReadout";
import useRecorderAutoSync from "@/hooks/training/useRecorderAutoSync";
import useTakeProcessing from "@/hooks/training/useTakeProcessing";
import useTrainingWindows from "@/hooks/training/useTrainingWindows";
import useTrainingLoop from "@/hooks/training/useTrainingLoop";
import useTrainingSteps from "@/hooks/training/useTrainingSteps";
import useActiveLyricIndex from "@/hooks/training/useActiveLyricIndex";

const TRAIN_LEAD_IN_SEC = 1.0;
const NOTE_DUR_SEC = 0.5;
const MAX_TAKES = 24;
const MAX_SESSION_SEC = 15 * 60;
const CONF_THRESHOLD = 0.5;

export default function Training() {
  const searchParams = useSearchParams();
  const modelIdFromQuery = searchParams.get("model_id") || null;

  // Windows (parse once from URL, editable locally if needed later)
  const { windowOnSec, windowOffSec } = useTrainingWindows({
    searchParams,
    defaultOn: 8,
    defaultOff: 8,
    min: 1,
    max: 120,
  });

  // Model row & Supabase range updater
  const { modelRowId, subjectId, genderLabel } = useTrainingModelRow({ modelIdFromQuery });
  const updateRange = useRangeUpdater(modelRowId);

  // Steps + range confirmations
  const { step, setStep, lowHz, highHz, canPlay, confirmLow, confirmHigh } = useTrainingSteps({
    updateRange,
    a4Hz: 440,
  });

  // Pitch engine + readouts
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

  // Phrase & lyrics
  const { phrase, words, reset: resetPhraseLyrics, advance: advancePhraseLyrics } =
    usePhraseLyrics({ lowHz, highHz, lyricStrategy: "mixed", noteDurSec: NOTE_DUR_SEC });

  // Recorder + UI timer
  const { isRecording, start: startRec, stop: stopRec, wavBlob, startedAtMs, sampleRateOut, pcm16k } =
    useWavRecorder({ sampleRateOut: 16000 });
  const uiRecordSec = useUiRecordTimer(isRecording, startedAtMs ?? null);

  // Loop state machine
  const loop = useTrainingLoop({
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

  // Auto-sync recorder with loop's intent
  useRecorderAutoSync({
    enabled: step === "play",
    shouldRecord: loop.shouldRecord,
    isRecording,
    startRec,
    stopRec,
  });

  // Sample-perfect WAV post-processing
  useTakeProcessing({
    wavBlob,
    sampleRateOut,
    pcm16k,
    windowOnSec,
    onTakeReady: ({ exactBlob, exactSamples }) => {
      // eslint-disable-next-line no-console
      console.log("[musicianship] take ready", {
        modelRowId,
        subjectId,
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

  // Active lyric highlight (auto-clears when not recording in play step)
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
