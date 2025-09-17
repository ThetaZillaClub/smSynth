// components/training/TrainingGame.tsx
"use client";

import React from "react";

import GameLayout from "./layout/GameLayout";
import RangeCapture from "./layout/range/RangeCapture";
import TrainingSessionPanel from "./layout/session/TrainingSessionPanel";

// hooks
import usePitchDetection from "@/hooks/pitch/usePitchDetection";
import usePhraseLyrics from "@/hooks/lyrics/usePhraseLyrics";
import useWavRecorder from "@/hooks/audio/useWavRecorder";
import useRecorderAutoSync from "@/hooks/audio/useRecorderAutoSync";
import useTakeProcessing from "@/hooks/audio/useTakeProcessing";
import usePracticeLoop from "@/hooks/gameplay/usePracticeLoop";
import useStudentRow from "@/hooks/students/useStudentRow";
import useStudentRangeUpdater from "@/hooks/students/useStudentRangeUpdater";
import useRangeSteps from "./layout/range/useRangeSteps";

import useTransport from "@/hooks/transport/useTransport";
import { secondsPerBeat, beatsToSeconds, barsToBeats } from "@/utils/time/tempo";

type Props = {
  title?: string;
  /** Optional: if you're rendering this on a student page, pass the studentId here instead of using query. */
  studentId?: string | null;
};

const MAX_TAKES = 24;
const MAX_SESSION_SEC = 15 * 60;
const CONF_THRESHOLD = 0.5;

export default function TrainingGame({ title = "Training", studentId = null }: Props) {
  // student row & range label updater (front-end naming only)
  const { studentRowId, studentName, genderLabel } = useStudentRow({
    studentIdFromQuery: studentId,
  });
  const updateRange = useStudentRangeUpdater(studentRowId);

  // steps + range confirmations
  const { step, lowHz, highHz, canPlay, confirmLow, confirmHigh } = useRangeSteps({
    updateRange,
    a4Hz: 440,
  });

  // global transport (SPA state)
  const { bpm, ts, leadBeats, restBars } = useTransport();
  const secPerBeat = secondsPerBeat(bpm, ts.den);
  const leadInSec = beatsToSeconds(leadBeats, bpm, ts.den);
  const restBeats = barsToBeats(restBars, ts.num);
  const restSec = beatsToSeconds(restBeats, bpm, ts.den);

  // pitch engine
  const { pitch, confidence, isReady, error } = usePitchDetection("/models/swiftf0", {
    enabled: true,
    fps: 50,
    minDb: -45,
    smoothing: 2,
    centsTolerance: 3,
  });
  const liveHz = typeof pitch === "number" ? pitch : null;

  // phrase & lyrics — baseline: one note per beat (rhythm generator can swap in later)
  const { phrase, words, reset: resetPhraseLyrics, advance: advancePhraseLyrics } =
    usePhraseLyrics({ lowHz, highHz, lyricStrategy: "mixed", noteDurSec: secPerBeat });

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

  // exercise length = phrase length; total take = lead-in + phrase
  const phraseSec =
    (phrase?.durationSec && Number.isFinite(phrase.durationSec) ? phrase.durationSec : secPerBeat * 8);
  const totalTakeSec = leadInSec + phraseSec;

  // loop state machine
  const loop = usePracticeLoop({
    step,
    lowHz,
    highHz,
    phrase,
    words,
    windowOnSec: totalTakeSec,    // record through count-in + phrase (we trim the head)
    windowOffSec: restSec,        // musical rest based on TS & BPM
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

  // per-take WAV post-processing (trim off the musical count-in)
  useTakeProcessing({
    wavBlob,
    sampleRateOut,
    pcm16k,
    windowOnSec: phraseSec,
    trimHeadSec: leadInSec,
    onTakeReady: ({ exactBlob, exactSamples }) => {
      // eslint-disable-next-line no-console
      console.log("[musicianship] take ready", {
        studentRowId,
        studentName,
        genderLabel,
        bpm,
        ts: `${ts.num}/${ts.den}`,
        leadBeats,
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
      leadInSec={leadInSec} // visual musical count-in
      /** For internal hooks */
      isReady={isReady}
      step={step}
      loopPhase={loop.loopPhase}
    >
      {isRangeStep && (
        <RangeCapture
          key={`range-${step}`}   // force a fresh mount per step → instant reset
          mode={step as "low" | "high"}
          active
          pitchHz={liveHz}
          /** keep range capture at a fixed 1.0s hold, independent of transport BPM/TS */
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
          recordSec={totalTakeSec}     // shows count-in + phrase
          restSec={restSec}            // musical rest shown in UI
          maxTakes={MAX_TAKES}
          maxSessionSec={MAX_SESSION_SEC}
          // musical transport for richer display
          bpm={bpm}
          ts={ts}
          leadBeats={leadBeats}
          restBars={restBars}
        />
      )}
    </GameLayout>
  );
}
