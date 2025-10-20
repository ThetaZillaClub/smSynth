// components/training/TrainingGame.tsx
"use client";
import React, { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import GameLayout from "./layout/GameLayout";
import usePitchDetection from "@/hooks/pitch/usePitchDetection";
import useWavRecorder from "@/hooks/audio/useWavRecorder";
import useRecorderAutoSync from "@/hooks/audio/useRecorderAutoSync";
import usePracticeLoop from "@/hooks/gameplay/usePracticeLoop";
import useStudentRange from "@/hooks/students/useStudentRange";
import usePhrasePlayer from "@/hooks/audio/usePhrasePlayer";
import { barsToBeats } from "@/utils/time/tempo";
import type { Phrase } from "@/utils/stage";
import { useSidePanel } from "@/hooks/gameplay/useSidePanel";
import { type SessionConfig, DEFAULT_SESSION_CONFIG } from "./session";
import usePretest from "@/hooks/gameplay/usePretest";
import { useExerciseFabric } from "@/hooks/gameplay/useExerciseFabric";
import { useMelodyClef } from "@/hooks/gameplay/useMelodyClef";
import { useLeadInMetronome } from "@/hooks/gameplay/useLeadInMetronome";
import type { RhythmEvent } from "@/utils/phrase/phraseTypes";
import useScoringAlignment from "@/hooks/gameplay/useScoringAlignment";
import useTakeScoring from "@/hooks/gameplay/useTakeScoring";
import usePitchSampler from "@/hooks/pitch/usePitchSampler";
import { useGameplaySession } from "@/hooks/gameplay/useGameplaySession";
import { useVisionEnabled } from "@/components/settings/vision/vision-layout";
import useVisionLatency from "@/hooks/vision/useVisionLatency";
import { useTempoWindows } from "@/hooks/gameplay/useTempoWindows";
import { useVisionBeatRunner } from "@/hooks/vision/useVisionBeatRunner";
import { useFooterActions } from "@/hooks/gameplay/useFooterActions";
import { useScoringLifecycle } from "@/hooks/gameplay/useScoringLifecycle";

// UPDATED: timing-free capture (per note)
import useTimingFreeCapture from "@/hooks/gameplay/useTimingFreeCapture";
import useContentLeadInCue from "@/hooks/gameplay/useContentLeadInCue";
import CourseNavGate from "./layout/stage/side-panel/CourseNavGate";

type RhythmConfig = { lineEnabled?: boolean; detectEnabled?: boolean };

type Props = {
  title?: string;
  sessionConfig?: SessionConfig;
  studentRowId?: string | null;
  rangeLowLabel?: string | null;
  rangeHighLabel?: string | null;
  lessonSlug?: string | null; // lesson slug within its course
  sessionId?: string | null;
};

const CONF_THRESHOLD = 0.5;

export default function TrainingGame({
  title = "Training",
  sessionConfig = DEFAULT_SESSION_CONFIG,
  studentRowId = null,
  rangeLowLabel = null,
  rangeHighLabel = null,
  lessonSlug = null,
  sessionId = null,
}: Props) {
  const params = useParams<{ course?: string; lesson?: string }>();
  const courseSlugParam = (params?.course as string | undefined) ?? undefined;

  const { lowHz, highHz, loading: rangeLoading, error: rangeError } = useStudentRange(
    studentRowId,
    { rangeLowLabel, rangeHighLabel }
  );

  // Effective session from settings + range
  const { session: sessionEff } = useGameplaySession({
    sessionConfig,
    lowHz: lowHz ?? null,
    highHz: highHz ?? null,
  });

  const step = "play" as const;
  const {
    bpm,
    ts,
    leadBars,
    restBars,
    noteValue,
    noteDurSec,
    callResponseSequence,
    exerciseLoops,
    regenerateBetweenTakes,
    metronome,
    loopingMode,
    gestureLatencyMs = 90,
    // timing-free knobs
    timingFreeResponse,
    timingFreeMaxSec,          // legacy overall cap (kept but we’ll not rely on it)
    timingFreeMinCaptureSec,   // per-note capture
  } = sessionEff;

  // Phrase + clef
  const [seedBump, setSeedBump] = useState(0);
  const fabric = useExerciseFabric({
    sessionConfig: sessionEff,
    lowHz: lowHz ?? null,
    highHz: highHz ?? null,
    seedBump,
  });
  const phrase: Phrase | null = fabric.phrase;

  const melodyClef = useMelodyClef({
    phrase,
    scale: sessionEff.scale,
    sessionConfig: sessionEff,
    lowHz: lowHz ?? null,
    highHz: highHz ?? null,
  });

  // Timing windows (musical baseline)
  const { secPerBeat, leadInSec, restSec, recordWindowSec } = useTempoWindows({
    bpm,
    tsNum: ts.num,
    tsDen: ts.den,
    leadBars,
    restBars,
    noteValue,
    noteDurSec,
    phrase,
    fallbackPhraseSecOverride: fabric.fallbackPhraseSec ?? null,
  });
  const leadBeats = barsToBeats(leadBars, ts.num);

  // NEW: per-note response window length (5s per expected note)
  const expectedNotes = Math.max(1, phrase?.notes?.length ?? 1);
  const perNoteMaxSec = 5;
  const recordWindowSecEff: number = timingFreeResponse
    ? expectedNotes * perNoteMaxSec
    : recordWindowSec;

  const minCaptureSecEff: number = timingFreeResponse
    ? Math.max(0.1, Number.isFinite(timingFreeMinCaptureSec ?? NaN) ? (timingFreeMinCaptureSec as number) : 1)
    : 0;

  const MAX_TAKES = Math.max(1, Number(exerciseLoops ?? 10));
  const MAX_SESSION_SEC = 15 * 60;

  // IO
  const { pitch, confidence, isReady, error } = usePitchDetection("/models/swiftf0", {
    enabled: true,
    fps: 50,
    minDb: -45,
    smoothing: 2,
    centsTolerance: 3,
  });
  const liveHz = typeof pitch === "number" ? pitch : null;

  const {
    warm: warmPlayer,
    playA440,
    playMidiList,
    playLeadInTicks,
    playPhrase,
    playRhythm,
    playMelodyAndRhythm,
    stop: stopPlayback,
  } = usePhrasePlayer();

  const pretest = usePretest({
    sequence: callResponseSequence ?? [],
    bpm,
    ts,
    scale: sessionEff.scale ?? { tonicPc: 0, name: "major" },
    lowHz: lowHz ?? null,
    highHz: highHz ?? null,
    player: {
      playA440: async (s) => {
        await playA440(s);
      },
      playMidiList: async (m, d) => {
        await playMidiList(m, d);
      },
    },
  });

  const pretestRequired = (callResponseSequence?.length ?? 0) > 0;
  const pretestActive = pretestRequired && pretest.status !== "done";
  const exerciseUnlocked = !pretestRequired || pretest.status === "done";

  // Rhythm flags
  const rhythmCfg = (sessionEff.rhythm ?? {}) as RhythmConfig;
  const rhythmLineEnabled = rhythmCfg.lineEnabled !== false;
  const rhythmDetectEnabled = rhythmCfg.detectEnabled !== false;

  // Vision gating
  const { enabled: visionEnabled } = useVisionEnabled();
  const needVision = exerciseUnlocked && rhythmLineEnabled && rhythmDetectEnabled && visionEnabled;

  // Recorder + loop
  const {
    isRecording,
    start: startRec,
    stop: stopRec,
    startedAtMs,
    warm: warmRecorder,
  } = useWavRecorder({ sampleRateOut: 16000, persistentStream: true });

  // Lead-in cue behavior:
  const metronomeEff = sessionEff.view === "polar" ? false : !!metronome;

  const loop = usePracticeLoop({
    step,
    lowHz: lowHz ?? null,
    highHz: highHz ?? null,
    phrase,
    words: fabric.words,
    windowOnSec: recordWindowSecEff, // ← per-note budget applied (5s * notes)
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
      if (regenerateBetweenTakes && loopingMode) setSeedBump((n) => n + 1);
    },
    autoContinue: !!loopingMode,
    onRestComplete: () => {
      if (!loopingMode && regenerateBetweenTakes) setSeedBump((n) => n + 1);
    },
  });

  const shouldRecord =
    (pretestActive && pretest.shouldRecord) || (!pretestActive && loop.shouldRecord);
  useRecorderAutoSync({
    enabled: step === "play",
    shouldRecord,
    isRecording,
    startRec,
    stopRec,
  });

  useLeadInMetronome({
    enabled: exerciseUnlocked,
    metronome: metronomeEff,
    leadBeats,
    loopPhase: loop.loopPhase,
    anchorMs: loop.anchorMs,
    playLeadInTicks,
    secPerBeat,
  });

  useContentLeadInCue({
    enabled: exerciseUnlocked,
    pretestActive,
    metronomeEnabled: metronomeEff,
    loopPhase: loop.loopPhase,
    anchorMs: loop.anchorMs,
    phrase,
    melodyRhythm: fabric.melodyRhythm ?? null,
    bpm,
    tsNum: ts.num,
    tsDen: ts.den,
    playPhrase,
    playMelodyAndRhythm,
    stopPlayback,
  });

  const calibratedLatencyMs = useVisionLatency(gestureLatencyMs ?? 90);

  // Pitch sampler
  const samplerActive: boolean = !pretestActive && loop.loopPhase === "record";
  const samplerAnchor: number | null = !pretestActive ? loop.anchorMs ?? null : null;
  const sampler = usePitchSampler({
    active: samplerActive,
    anchorMs: samplerAnchor,
    hz: liveHz,
    confidence,
    fps: 60,
  });

  // Vision/tap runner
  const hand = useVisionBeatRunner({
    enabled: needVision,
    latencyMs: (calibratedLatencyMs ?? gestureLatencyMs) || 90,
    loopPhase: loop.loopPhase,
    anchorMs: loop.anchorMs,
    pretestActive,
    samplerReset: () => sampler.reset(),
  });

  // warm audio I/O
  useEffect(() => {
    (async () => {
      try { await warmPlayer(); } catch {}
      try { await warmRecorder(); } catch {}
    })();
  }, [warmPlayer, warmRecorder]);

  // Ensure audio stops whenever we go idle
  useEffect(() => {
    if (loop.loopPhase === "idle") stopPlayback();
  }, [loop.loopPhase, stopPlayback]);

  // Rhythm data
  const rhythmEffective: RhythmEvent[] | null = fabric.syncRhythmFabric ?? null;
  const haveRhythm: boolean = rhythmLineEnabled && (rhythmEffective?.length ?? 0) > 0;

  // Scoring
  const { sessionScores, scoreTake } = useTakeScoring();
  const alignForScoring = useScoringAlignment();

  // Centralized scoring/submission snapshots
  const { takeSnapshots } = useScoringLifecycle({
    loopPhase: loop.loopPhase,
    pretestActive,
    phrase,
    rhythmEffective,
    melodyRhythm: fabric.melodyRhythm ?? null,
    bpm,
    den: ts.den,
    leadInSec,
    calibratedLatencyMs,
    gestureLatencyMs,
    exerciseLoops,
    lessonSlug,
    sessionId,
    sessionScores,
    scoreTake,
    alignForScoring,
    sampler,
    hand,
    haveRhythm,
    // timing-free
    timingFreeResponse: !!timingFreeResponse,
    freeCaptureSec: recordWindowSecEff,
  });

  // Footer actions
  const { footerTonicLabel, footerArpLabel, playFooterTonic, playFooterArp } =
    useFooterActions({
      lowHz,
      bpm,
      den: ts.den,
      tsNum: ts.num,
      scaleName: sessionEff.scale?.name ?? "major",
      tonicPc: sessionEff.scale?.tonicPc ?? 0,
      playMidiList,
    });

  // UI state
  const showLyrics = step === "play" && !!fabric.words?.length;
  const readinessError =
    rangeError
      ? `Range load failed: ${rangeError}`
      : !rangeLoading && (lowHz == null || highHz == null)
      ? "No saved range found. Please set your vocal range first."
      : null;
  const showExercise = !pretestActive;
  const running = showExercise && loop.running;
  const startAtMs = showExercise ? loop.anchorMs : null;
  const statusText = pretestActive ? pretest.currentLabel : loop.statusText;
  const uiRunning = pretestActive ? running : loop.loopPhase !== "rest" ? running : false;

  const currentPretestKind =
    (callResponseSequence?.[pretest.modeIndex]?.kind as
      | "single_tonic"
      | "derived_tonic"
      | "guided_arpeggio"
      | "internal_arpeggio"
      | undefined) ?? undefined;

  // Side panel (memoized)
  const sidePanel = useSidePanel({
    pretestActive,
    pretestStatusText: statusText,
    pretestRunning: pretest.running,
    pretestInResponse: pretest.status === "response",
    currentPretestKind,
    pretestStart: () => {
      loop.clearAll();
      stopPlayback();
      stopRec().catch(() => {});
      pretest.start();
    },
    continueResponse: pretest.continueResponse,
    bpm,
    tsNum: ts.num,
    den: ts.den,
    tonicPc: sessionEff.scale?.tonicPc ?? 0,
    lowHz: lowHz ?? null,
    scaleName: sessionEff.scale?.name ?? "major",
    liveHz,
    confidence,
    playMidiList,
    sessionScores,
    takeSnapshots,
    phrase,
    rhythmEffective,
    haveRhythm,
    player: { playPhrase, playRhythm, playMelodyAndRhythm, stop: stopPlayback },
  });

  const footerTonicAction = exerciseUnlocked
    ? { label: footerTonicLabel, onClick: playFooterTonic, disabled: false, title: "Play tonic" }
    : undefined;

  const footerArpAction = exerciseUnlocked
    ? { label: footerArpLabel, onClick: playFooterArp, disabled: false, title: "Play arpeggio" }
    : undefined;

  // UPDATED: timing-free capture per note (progress + target for Polar)
  const { centerProgress01, targetRel } = useTimingFreeCapture({
    enabled: !!timingFreeResponse && !pretestActive,
    loopPhase: loop.loopPhase as any,
    liveHz,
    confidence,
    minCaptureSec: minCaptureSecEff,  // 1s per note
    perNoteMaxSec,                    // 5s per note
    threshold: CONF_THRESHOLD,
    phrase,
    tonicPc: sessionEff.scale?.tonicPc ?? 0,
    endRecordEarly: loop.endRecordEarly,
  });

  // Stage view routing: switch to analytics after the last take
  const sessionComplete =
    !pretestActive && (loop.takeCount ?? 0) >= MAX_TAKES && sessionScores.length >= MAX_TAKES;
  const stageView: "piano" | "sheet" | "polar" | "analytics" = sessionComplete
    ? "analytics"
    : ((sessionEff.view as "piano" | "sheet" | "polar"));

  const analyticsSidePanel = (
    <CourseNavGate
      courseSlugParam={courseSlugParam}
      lessonSlug={lessonSlug}
      sessionComplete={sessionComplete}
    />
  );

  return (
    <GameLayout
      title={title}
      error={error || readinessError}
      running={running}
      uiRunning={uiRunning}
      onToggle={onToggleExercise}
      phrase={phrase ?? undefined}
      lyrics={showLyrics ? fabric.words ?? undefined : undefined}
      livePitchHz={liveHz}
      confidence={confidence}
      confThreshold={CONF_THRESHOLD}
      startAtMs={startAtMs}
      leadInSec={leadInSec}
      isReady={isReady && (!!phrase || pretestActive)}
      step={step}
      loopPhase={pretestActive ? "call" : loop.loopPhase}
      rhythm={rhythmEffective ?? undefined}
      melodyRhythm={fabric.melodyRhythm ?? undefined}
      bpm={bpm}
      den={ts.den}
      tsNum={ts.num}
      keySig={fabric.keySig}
      view={stageView}
      clef={melodyClef}
      lowHz={lowHz ?? null}
      highHz={highHz ?? null}
      sessionPanel={
        (!!phrase && !pretestActive) ? { bpm, ts, roundCurrent: Math.min(MAX_TAKES, (loop.takeCount ?? 0) + 1), roundTotal: MAX_TAKES } : undefined
      }
      sidePanel={sidePanel}
      tonicPc={exerciseUnlocked ? sessionEff.scale?.tonicPc ?? null : null}
      scaleName={exerciseUnlocked ? sessionEff.scale?.name ?? null : null}
      tonicAction={footerTonicAction}
      arpAction={footerArpAction}
      analytics={{
        scores: sessionScores,
        snapshots: takeSnapshots,
        bpm,
        den: ts.den,
        tonicPc: sessionEff.scale?.tonicPc ?? 0,
        scaleName: sessionEff.scale?.name ?? "major",
      }}
      analyticsSidePanel={analyticsSidePanel}
      centerProgress01={centerProgress01}
      // NEW: tell Polar which note is currently expected
      targetRelOverride={typeof targetRel === "number" ? targetRel : undefined}
    />
  );

  function onToggleExercise() {
    if (!(!pretestRequired || pretest.status === "done")) return;
    stopPlayback();
    loop.toggle();
  }
}
