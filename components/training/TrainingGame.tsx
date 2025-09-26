// components/training/TrainingGame.tsx
"use client";
import React, { useMemo, useState } from "react";
import GameLayout from "./layout/GameLayout";
import { SessionPanel, PretestPanel } from "./session";
import usePitchDetection from "@/hooks/pitch/usePitchDetection";
import useWavRecorder from "@/hooks/audio/useWavRecorder";
import useRecorderAutoSync from "@/hooks/audio/useRecorderAutoSync";
import usePracticeLoop from "@/hooks/gameplay/usePracticeLoop";
import useStudentRange from "@/hooks/students/useStudentRange";
import usePhrasePlayer from "@/hooks/audio/usePhrasePlayer";
import { secondsPerBeat, beatsToSeconds, barsToBeats, noteValueToBeats } from "@/utils/time/tempo";
import type { Phrase } from "@/utils/stage";
import { type SessionConfig, DEFAULT_SESSION_CONFIG } from "./session";
import usePretest from "@/hooks/gameplay/usePretest";
import { useExerciseFabric } from "@/hooks/gameplay/useExerciseFabric";
import { useMelodyClef } from "@/hooks/gameplay/useMelodyClef";
import { useLeadInMetronome } from "@/hooks/gameplay/useLeadInMetronome";
import TakeReview from "@/components/training/take-review-layout/TakeReview";

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
  const { lowHz, highHz, loading: rangeLoading, error: rangeError } =
    useStudentRange(studentRowId, { rangeLowLabel, rangeHighLabel });

  const step: "play" = "play";
  const {
    bpm, ts, leadBars, restBars,
    noteValue, noteDurSec, lyricStrategy,
    view, callResponseSequence,
    exerciseLoops, regenerateBetweenTakes, metronome,
    loopingMode,
  } = sessionConfig;

  const secPerBeat = secondsPerBeat(bpm, ts.den);
  const secPerBar  = ts.num * secPerBeat;
  const leadBeats  = barsToBeats(leadBars, ts.num);
  const leadInSec  = beatsToSeconds(leadBeats, bpm, ts.den);
  const restBeats  = barsToBeats(restBars, ts.num);
  const restSec    = beatsToSeconds(restBeats, bpm, ts.den);

  const MAX_TAKES = Math.max(1, Number(exerciseLoops ?? 24));
  const MAX_SESSION_SEC = 15 * 60;

  const { pitch, confidence, isReady, error } = usePitchDetection("/models/swiftf0", {
    enabled: true, fps: 50, minDb: -45, smoothing: 2, centsTolerance: 3,
  });
  const liveHz = typeof pitch === "number" ? pitch : null;

  // Regeneration seed between takes
  const [seedBump, setSeedBump] = useState(0);

  // —— Build the exercise (phrase, rhythms, lyrics, key) via a hook
  const fabric = useExerciseFabric({
    sessionConfig,
    lowHz: lowHz ?? null,
    highHz: highHz ?? null,
    seedBump,
  });

  const phrase: Phrase | null = fabric.phrase;

  // —— Clef selection isolated (stable + respects tonic windows)
  const melodyClef = useMelodyClef({
    phrase,
    scale: sessionConfig.scale,
    sessionConfig,
    lowHz: lowHz ?? null,
    highHz: highHz ?? null,
  });

  // —— Timing windows derived from phrase duration
  const genNoteDurSec =
    typeof noteValue === "string"
      ? beatsToSeconds(noteValueToBeats(noteValue, ts.den), bpm, ts.den)
      : (noteDurSec ?? secPerBeat);

  const fallbackPhraseSec =
    fabric.fallbackPhraseSec ?? genNoteDurSec * 8;

  const phraseSec =
    phrase?.notes?.length
      ? (phrase.durationSec ?? fallbackPhraseSec)
      : fallbackPhraseSec;

  const lastEndSec = phrase?.notes?.length
    ? phrase.notes.reduce((mx, n) => Math.max(mx, n.startSec + n.durSec), 0)
    : phraseSec;

  const recordWindowSec =
    Math.ceil(lastEndSec / Math.max(1e-9, secPerBar)) * secPerBar;

  // —— Audio player + pretest
  const {
    playA440, playMidiList, playLeadInTicks,
    playPhrase, playRhythm, playMelodyAndRhythm, stop: stopPlayback
  } = usePhrasePlayer();

  const pretest = usePretest({
    sequence: callResponseSequence ?? [],
    bpm, ts,
    scale: sessionConfig.scale ?? { tonicPc: 0, name: "major" },
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

  // —— Practice loop
  const {
    isRecording, start: startRec, stop: stopRec, startedAtMs,
  } = useWavRecorder({ sampleRateOut: 16000 });

  const [reviewVisible, setReviewVisible] = useState(false);

  const loop = usePracticeLoop({
    step,
    lowHz: lowHz ?? null,
    highHz: highHz ?? null,
    phrase,
    words: fabric.words,
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

    // Regenerate policy
    onAdvancePhrase: () => {
      if (regenerateBetweenTakes && loopingMode) setSeedBump((n) => n + 1);
    },

    onEnterPlay: () => {},

    // auto-continue & review callback
    autoContinue: !!loopingMode,
    onRestComplete: () => {
      if (!loopingMode) {
        setReviewVisible(true);
      }
    },
  });

  // —— Recorder auto start/stop
  const shouldRecord =
    (pretestActive && pretest.shouldRecord) || (!pretestActive && loop.shouldRecord);

  useRecorderAutoSync({
    enabled: step === "play",
    shouldRecord,
    isRecording,
    startRec,
    stopRec,
  });

  // —— Metronome lead-in (as its own effect hook)
  useLeadInMetronome({
    enabled: !pretestActive,
    metronome,
    leadBeats,
    loopPhase: loop.loopPhase,
    anchorMs: loop.anchorMs,
    playLeadInTicks,
    secPerBeat,
  });

  // —— UI plumbing
  const showLyrics = step === "play" && !!fabric.words?.length;
  const readinessError = rangeError
    ? `Range load failed: ${rangeError}`
    : !rangeLoading && (lowHz == null || highHz == null)
    ? "No saved range found. Please set your vocal range first."
    : null;

  const running   = pretestActive ? pretest.running   : loop.running;
  const startAtMs = pretestActive ? pretest.anchorMs  : loop.anchorMs;
  const statusText = pretestActive ? pretest.currentLabel : loop.statusText;

  // —— Review playback handlers (⚠ normalize to concrete array + boolean)
  const rhythmToUse = (fabric.melodyRhythm?.length
    ? fabric.melodyRhythm
    : (fabric.syncRhythmFabric ?? [])) as any[];
  const haveRhythm: boolean = (rhythmToUse?.length ?? 0) > 0;

  const onPlayMelody = async () => {
    if (!phrase) return;
    await playPhrase(phrase, { bpm, tsNum: ts.num, tsDen: ts.den, leadBars: 0, metronome: false });
  };
  const onPlayRhythm = async () => {
    if (!haveRhythm) return;
    await playRhythm(rhythmToUse as any, { bpm, tsNum: ts.num, tsDen: ts.den });
  };
  const onPlayBoth = async () => {
    if (!phrase) return;
    await playMelodyAndRhythm(phrase, rhythmToUse as any, {
      bpm,
      tsNum: ts.num,
      tsDen: ts.den,
      metronome: true,
    });
  };
  const onStopPlayback = () => stopPlayback();

  const onNextPhrase = () => {
    setSeedBump((n) => n + 1);
    setReviewVisible(false);
  };

  return (
    <GameLayout
      title={title}
      error={error || readinessError}
      running={running}
      onToggle={loop.toggle}
      phrase={phrase ?? undefined}
      lyrics={showLyrics ? (fabric.words ?? undefined) : undefined}
      livePitchHz={liveHz}
      confidence={confidence}
      confThreshold={CONF_THRESHOLD}
      startAtMs={startAtMs}
      leadInSec={leadInSec}
      isReady={isReady && (!!phrase || pretestActive)}
      step={step}
      loopPhase={pretestActive ? "call" : loop.loopPhase}
      rhythm={fabric.syncRhythmFabric ?? undefined}
      melodyRhythm={fabric.melodyRhythm ?? undefined}
      bpm={bpm}
      den={ts.den}
      tsNum={ts.num}
      keySig={fabric.keySig}
      view={view}
      clef={melodyClef}
      lowHz={lowHz ?? null}
      highHz={highHz ?? null}
    >
      {pretestActive ? (
        <PretestPanel
          statusText={statusText}
          detail="Call & Response has no metronome lead-in. You’ll still see the full exercise on the stage."
          running={pretest.running}
          onStart={pretest.start}
          onContinue={pretest.continueResponse}
          onReset={pretest.reset}
        />
      ) : reviewVisible ? (
        <TakeReview
          haveRhythm={haveRhythm}
          onPlayMelody={onPlayMelody}
          onPlayRhythm={onPlayRhythm}
          onPlayBoth={onPlayBoth}
          onStop={onStopPlayback}
          onNext={onNextPhrase}
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

      {!pretestActive && (callResponseSequence?.length ?? 0) > 0 && pretest.status === "done" && !pretestDismissed ? (
        <div className="mt-2 rounded-lg border border-[#d2d2d2] bg-[#ebebeb] p-3">
          ...
        </div>
      ) : null}
    </GameLayout>
  );
}
