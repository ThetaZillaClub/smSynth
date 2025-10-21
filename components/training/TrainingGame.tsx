// components/training/TrainingGame.tsx
"use client";
import React, { useState, useEffect, useMemo } from "react";
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

// NEW: visibility contract shared with side-panel
type AnalyticsVisibility = {
  showPitch: boolean;          // accuracy (+ precision)
  showIntervals: boolean;
  showMelodyRhythm: boolean;   // coverage/onset in note windows
  showRhythmLine: boolean;     // hand taps vs. blue line
};

type Props = {
  title?: string;
  sessionConfig?: SessionConfig;
  studentRowId?: string | null;
  rangeLowLabel?: string | null;
  rangeHighLabel?: string | null;
  lessonSlug?: string | null; // lesson slug within its course (e.g., "minor-2nd-deg-1-2")
  sessionId?: string | null;  // optional external UUID to use
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
    timingFreeMaxSec,
    timingFreeMinCaptureSec,
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

  // --- Visibility policy ------------------------------------------------------
  const visibility: AnalyticsVisibility = {
    showPitch: true,
    showIntervals: true,
    showMelodyRhythm: !timingFreeResponse,
    showRhythmLine: !timingFreeResponse && rhythmDetectEnabled && rhythmLineEnabled,
  };
  // ---------------------------------------------------------------------------

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

  const metronomeEff = sessionEff.view === "polar" ? false : !!metronome;

  const loop = usePracticeLoop({
    step,
    lowHz: lowHz ?? null,
    highHz: highHz ?? null,
    phrase,
    words: fabric.words,
    windowOnSec: recordWindowSecEff,
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

  // Scoring (now with resetScores for soft repeat)
  const { sessionScores, scoreTake, resetScores } = useTakeScoring();
  const alignForScoring = useScoringAlignment();

  // ─────────────────────── Stable, real UUID for sessionId ───────────────────────
  const genUUID = React.useCallback(() => {
    if (typeof crypto !== "undefined" && (crypto as any).randomUUID) {
      return (crypto as any).randomUUID() as string;
    }
    // Simple v4-ish fallback
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === "x" ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }, []);

  // Keep a base UUID stable for the lifetime of this component (or use the provided one)
  const sessionBaseIdRef = React.useRef<string>(sessionId ?? genUUID());
  useEffect(() => {
    if (sessionId && sessionId !== sessionBaseIdRef.current) {
      sessionBaseIdRef.current = sessionId;
    }
  }, [sessionId]);

  // Make sure we send a namespaced lesson slug "course/lesson" to the API
  const namespacedLessonSlug = useMemo(() => {
    const ls = (lessonSlug ?? "").trim();
    if (!ls) return null;
    if (ls.includes("/")) return ls; // already namespaced
    const cs = (courseSlugParam ?? "").trim();
    return cs ? `${cs}/${ls}` : ls; // fallback if course is missing (dev)
  }, [lessonSlug, courseSlugParam]);

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
    lessonSlug: namespacedLessonSlug,         // <<< send "course/lesson"
    sessionId: sessionBaseIdRef.current,      // <<< real UUID (persists to DB)
    sessionScores,
    scoreTake,
    alignForScoring,
    sampler,
    hand,
    haveRhythm,
    timingFreeResponse: !!timingFreeResponse,
    freeCaptureSec: recordWindowSecEff,
    freeMinHoldSec: minCaptureSecEff,
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
  const sidePanelBase = useSidePanel({
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

  // NEW: augment side panel with visibility mask
  const sidePanel = sidePanelBase
    ? ({ ...sidePanelBase, visibility } as typeof sidePanelBase & { visibility: typeof visibility })
    : undefined;

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

  // Lead-in: current note for Polar center text
  const [leadInRel, setLeadInRel] = useState<number | null>(null);
  useEffect(() => {
    if (pretestActive || loop.loopPhase !== "lead-in" || !phrase || loop.anchorMs == null) {
      setLeadInRel(null);
      return;
    }
    let raf = 0;
    const tonicPc = ((sessionEff.scale?.tonicPc ?? 0) % 12 + 12) % 12;
    const tick = () => {
      const tSec = (performance.now() - (loop.anchorMs as number)) / 1000;
      let rel: number | null = null;
      for (const n of phrase.notes) {
        const s = n.startSec, e = s + n.durSec;
        if (tSec >= s && tSec < e) {
          const pcAbs = ((Math.round(n.midi) % 12) + 12) % 12;
          rel = ((pcAbs - tonicPc) + 12) % 12;
          break;
        }
      }
      setLeadInRel(rel);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [pretestActive, loop.loopPhase, phrase, loop.anchorMs, sessionEff.scale?.tonicPc]);

  const targetRelForPolar =
    loop.loopPhase === "lead-in"
      ? (typeof leadInRel === "number" ? leadInRel : undefined)
      : (typeof targetRel === "number" ? targetRel : undefined);

  // ─────────── FIX: don’t flip to analytics until snapshots are in sync ───────────
  const takesSynced = sessionScores.length === takeSnapshots.length;
  const sessionComplete =
    !pretestActive &&
    (loop.takeCount ?? 0) >= MAX_TAKES &&
    sessionScores.length >= MAX_TAKES &&
    takesSynced;

  // If somehow desynced, trim scores passed to analytics so charts always align
  const analyticsScores = takesSynced
    ? sessionScores
    : sessionScores.slice(0, takeSnapshots.length);

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
      view={sessionComplete ? "analytics" : (sessionEff.view as "piano" | "sheet" | "polar")}
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
        scores: analyticsScores,
        snapshots: takeSnapshots,
        bpm,
        den: ts.den,
        tonicPc: sessionEff.scale?.tonicPc ?? 0,
        scaleName: sessionEff.scale?.name ?? "major",
        visibility,
      }}
      analyticsSidePanel={
        <CourseNavGate
          courseSlugParam={courseSlugParam}
          lessonSlug={lessonSlug}
          sessionComplete={sessionComplete}
          onRepeat={handleRepeat}
        />
      }
      centerProgress01={centerProgress01}
      targetRelOverride={targetRelForPolar}
    />
  );

  function handleRepeat() {
    stopPlayback();
    loop.clearAll?.();
    resetScores();
    if (sessionEff.loopingMode) {
      setTimeout(() => {
        loop.toggle();
      }, 0);
    }
  }

  function onToggleExercise() {
    if (!(!pretestRequired || pretest.status === "done")) return;
    stopPlayback();
    loop.toggle();
  }
}
