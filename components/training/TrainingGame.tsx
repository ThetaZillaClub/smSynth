// components/training/TrainingGame.tsx
"use client";
import React, { useState, useEffect, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
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

// NEW: course registry (actual lessons)
import { COURSES, findCourse } from "@/lib/courses/registry";
import type { CourseDef, LessonDef } from "@/lib/courses/types";

// NEW: course navigation panel
import CourseNavPanel from "./layout/stage/side-panel/CourseNavPanel";

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
  const router = useRouter();
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
    // NEW timing-free knobs
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

  // —— Effective record window: timing-free courses use a relaxed max window.
  const recordWindowSecEff: number = timingFreeResponse
    ? Math.max(0.5, Number.isFinite(timingFreeMaxSec ?? NaN) ? (timingFreeMaxSec as number) : 10)
    : recordWindowSec;

  const minCaptureSecEff: number = timingFreeResponse
    ? Math.max(0.1, Number.isFinite(timingFreeMinCaptureSec ?? NaN) ? (timingFreeMinCaptureSec as number) : 1)
    : 0; // unused otherwise

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
  // For courses like Pitch Tune (polar view), we *don't* want metronome ticks.
  // Instead, during the lead-in we play the content cue (first bar / phrase).
  const metronomeEff = sessionEff.view === "polar" ? false : !!metronome;

  const loop = usePracticeLoop({
    step,
    lowHz: lowHz ?? null,
    highHz: highHz ?? null,
    phrase,
    words: fabric.words,
    windowOnSec: recordWindowSecEff, // ← use effective window for timing-free mode
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
    // no onEnterPlay: cue is scheduled below during the "lead-in" phase
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
    metronome: metronomeEff, // ← disable ticks for polar (Pitch Tune); we provide content cue instead
    leadBeats,
    loopPhase: loop.loopPhase,
    anchorMs: loop.anchorMs,
    playLeadInTicks,
    secPerBeat,
  });

  // Per-take content cue during LEAD-IN (Pitch Tune / polar view).
  useEffect(() => {
    const wantContentLeadIn = exerciseUnlocked && !pretestActive && !metronomeEff;
    if (!wantContentLeadIn) return;
    if (loop.loopPhase !== "lead-in") return;
    if (!phrase) return;

    try {
      // stop anything previously scheduled before we align the cue
      stopPlayback();
      const baseOpts = {
        bpm,
        tsNum: ts.num,
        tsDen: ts.den,
        a4Hz: 440,
        metronome: false,
      } as const;

      if (fabric.melodyRhythm && fabric.melodyRhythm.length > 0) {
        void playMelodyAndRhythm(phrase, fabric.melodyRhythm, {
          ...baseOpts,
          startAtPerfMs: loop.anchorMs ?? null,
        });
      } else {
        void playPhrase(phrase, {
          ...baseOpts,
          leadBars: 0,
          startAtPerfMs: loop.anchorMs ?? null,
        } as any);
      }
    } catch {}
  }, [
    exerciseUnlocked,
    pretestActive,
    metronomeEff,
    loop.loopPhase,
    loop.anchorMs,
    phrase,
    fabric.melodyRhythm,
    playMelodyAndRhythm,
    playPhrase,
    stopPlayback,
    bpm,
    ts.num,
    ts.den,
  ]);

  const calibratedLatencyMs = useVisionLatency(gestureLatencyMs);

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
    latencyMs: calibratedLatencyMs ?? gestureLatencyMs,
    loopPhase: loop.loopPhase,
    anchorMs: loop.anchorMs,
    pretestActive,
    samplerReset: () => sampler.reset(),
  });

  // warm audio I/O
  useEffect(() => {
    (async () => {
      try {
        await warmPlayer();
      } catch {}
      try {
        await warmRecorder();
      } catch {}
    })();
  }, [warmPlayer, warmRecorder]);

  // Ensure audio stops whenever we go idle (e.g., user paused during lead-in)
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

    // NEW: make scoring timing-agnostic for timing-free courses
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

  const onToggleExercise = () => {
    if (!(!pretestRequired || pretest.status === "done")) return;
    // stop any scheduled metronome/cue audio immediately
    stopPlayback();
    loop.toggle();
  };

  const showFooterSessionPanel = !!phrase && !pretestActive;
  const completedTakes = loop.takeCount ?? 0;
  const roundCurrent = Math.min(MAX_TAKES, completedTakes + 1);
  const footerSessionPanel = showFooterSessionPanel
    ? { bpm, ts, roundCurrent, roundTotal: MAX_TAKES }
    : undefined;

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
    ? {
        label: footerTonicLabel,
        onClick: playFooterTonic,
        disabled: false,
        title: "Play tonic",
      }
    : undefined;

  const footerArpAction = exerciseUnlocked
    ? {
        label: footerArpLabel,
        onClick: playFooterArp,
        disabled: false,
        title: "Play arpeggio",
      }
    : undefined;

  // ───────────────────────────────────────────────────────────────
  // NEW: early-end in timing-free mode after N seconds of confident audio
  // ───────────────────────────────────────────────────────────────
  const confidentStreakStartMsRef = useRef<number | null>(null);
  useEffect(() => {
    if (!timingFreeResponse || pretestActive) {
      confidentStreakStartMsRef.current = null;
      return;
    }
    if (loop.loopPhase !== "record") {
      confidentStreakStartMsRef.current = null;
      return;
    }

    const isConfident =
      typeof liveHz === "number" &&
      liveHz > 0 &&
      typeof confidence === "number" &&
      confidence >= CONF_THRESHOLD;

    const now = performance.now();

    if (isConfident) {
      if (confidentStreakStartMsRef.current == null) {
        confidentStreakStartMsRef.current = now;
      } else {
        const elapsed = (now - confidentStreakStartMsRef.current) / 1000;
        if (elapsed >= minCaptureSecEff) {
          // End the take early; hook guards against wrong phases internally.
          loop.endRecordEarly();
          confidentStreakStartMsRef.current = null; // avoid double-fire
        }
      }
    } else {
      // reset streak when signal drops
      confidentStreakStartMsRef.current = null;
    }
  }, [
    timingFreeResponse,
    pretestActive,
    loop.loopPhase,
    liveHz,
    confidence,
    minCaptureSecEff,
    loop,
  ]);

  // ───────────────────────────────────────────────────────────────
  // Polar center progress ring (CONFIDENCE-BASED, timing-free only)
  // - Fills 0→1 while the user maintains a confident tone.
  // - Independent of record window length.
  // - No pulse; no snap to 100% unless you've truly reached the threshold.
  // ───────────────────────────────────────────────────────────────
  const [centerProgress01, setCenterProgress01] = useState<number>(0);
  useEffect(() => {
    let raf = 0;
    let runningAnim = true;

    const animate = () => {
      if (!runningAnim) return;

      if (timingFreeResponse && !pretestActive && loop.loopPhase === "record") {
        const start = confidentStreakStartMsRef.current;
        if (typeof start === "number" && minCaptureSecEff > 0) {
          const elapsed = (performance.now() - start) / 1000;
          const frac = Math.max(0, Math.min(1, elapsed / minCaptureSecEff));
          setCenterProgress01(frac);
        } else {
          // either no confident streak yet or confidence dropped
          setCenterProgress01(0);
        }
      } else {
        // outside of timing-free RECORD, keep ring empty
        setCenterProgress01(0);
      }

      raf = requestAnimationFrame(animate);
    };

    raf = requestAnimationFrame(animate);
    return () => {
      runningAnim = false;
      cancelAnimationFrame(raf);
    };
  }, [timingFreeResponse, pretestActive, loop.loopPhase, minCaptureSecEff]);

  // ───────────────────────────────────────────────────────────────
  // Stage view routing: switch to analytics after the last take
  // ───────────────────────────────────────────────────────────────
  const sessionComplete =
    !pretestActive && completedTakes >= MAX_TAKES && sessionScores.length >= MAX_TAKES;
  const stageView: "piano" | "sheet" | "polar" | "analytics" = sessionComplete
    ? "analytics"
    : ((sessionEff.view as "piano" | "sheet" | "polar"));

  // ───────────────────────────────────────────────────────────────
  // Analytics → Course / Lesson navigation (REAL registry only)
  // ───────────────────────────────────────────────────────────────

  // Resolve current course from param; if missing, try to find by lesson slug.
  let currentCourse: CourseDef | undefined = courseSlugParam
    ? findCourse(courseSlugParam)
    : undefined;
  if (!currentCourse && lessonSlug) {
    currentCourse = COURSES.find((c) => c.lessons.some((l) => l.slug === lessonSlug));
  }

  const currentLesson: LessonDef | undefined =
    currentCourse?.lessons.find((l) => l.slug === lessonSlug) ?? undefined;

  // Prev/Next within the *current course* (only real lessons)
  const { prevLessonRef, nextLessonRef } = (() => {
    if (!currentCourse || !currentLesson)
      return { prevLessonRef: null, nextLessonRef: null };
    const idx = currentCourse.lessons.findIndex((l) => l.slug === currentLesson.slug);
    const prev = idx > 0 ? currentCourse.lessons[idx - 1] : null;
    const next =
      idx >= 0 && idx < currentCourse.lessons.length - 1
        ? currentCourse.lessons[idx + 1]
        : null;

    const toRef = (c: CourseDef, l: LessonDef) => ({
      slug: `${c.slug}/${l.slug}`, // path part used by onGoTo
      title: l.title,
      summary: l.summary, // << provide summary for card subtext
    });
    return {
      prevLessonRef: prev ? toRef(currentCourse, prev) : null,
      nextLessonRef: next ? toRef(currentCourse, next) : null,
    };
  })();

  const onGoToPath = (slugPath: string) => {
    // slugPath is "courseSlug/lessonSlug"
    router.push(`/courses/${slugPath}`);
  };

  const onRepeat = () => {
    // Refresh current lesson page → new session id upstream
    router.refresh();
  };

  const analyticsSidePanel = sessionComplete ? (
    <CourseNavPanel
      currentLesson={
        currentCourse && currentLesson
          ? {
              slug: `${currentCourse.slug}/${currentLesson.slug}`,
              title: currentLesson.title,
              summary: currentLesson.summary, // << show summary on Repeat card
            }
          : undefined
      }
      prevLesson={prevLessonRef ?? undefined}
      nextLesson={nextLessonRef ?? undefined}
      onGoTo={onGoToPath}
      onRepeat={onRepeat}
    />
  ) : null;

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
      sessionPanel={footerSessionPanel}
      sidePanel={sidePanel}
      tonicPc={exerciseUnlocked ? sessionEff.scale?.tonicPc ?? null : null}
      scaleName={exerciseUnlocked ? sessionEff.scale?.name ?? null : null}
      tonicAction={footerTonicAction}
      arpAction={footerArpAction}
      // NEW: provide analytics data for the stage when session completes
      analytics={{
        scores: sessionScores,
        snapshots: takeSnapshots,
        bpm,
        den: ts.den,
        tonicPc: sessionEff.scale?.tonicPc ?? 0,
        scaleName: sessionEff.scale?.name ?? "major",
      }}
      // NEW: swap right panel to Course Navigation when in analytics view
      analyticsSidePanel={analyticsSidePanel}
      // NEW: Polar center badge progress ring (confidence-based)
      centerProgress01={centerProgress01}
    />
  );
}
