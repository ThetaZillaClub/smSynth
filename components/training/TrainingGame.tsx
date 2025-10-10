// components/training/TrainingGame.tsx
"use client";
import React, { useRef, useState, useEffect } from "react";
import GameLayout from "./layout/GameLayout";
import usePitchDetection from "@/hooks/pitch/usePitchDetection";
import useWavRecorder from "@/hooks/audio/useWavRecorder";
import useRecorderAutoSync from "@/hooks/audio/useRecorderAutoSync";
import usePracticeLoop from "@/hooks/gameplay/usePracticeLoop";
import useStudentRange from "@/hooks/students/useStudentRange";
import usePhrasePlayer from "@/hooks/audio/usePhrasePlayer";
import {
  secondsPerBeat,
  beatsToSeconds,
  barsToBeats,
  noteValueToBeats,
} from "@/utils/time/tempo";
import type { Phrase } from "@/utils/stage";
import { type SessionConfig, DEFAULT_SESSION_CONFIG } from "./session";
import usePretest from "@/hooks/gameplay/usePretest";
import { useExerciseFabric } from "@/hooks/gameplay/useExerciseFabric";
import { useMelodyClef } from "@/hooks/gameplay/useMelodyClef";
import { useLeadInMetronome } from "@/hooks/gameplay/useLeadInMetronome";
import useHandBeat from "@/hooks/vision/useHandBeat";
import type { RhythmEvent } from "@/utils/phrase/phraseTypes";
import useScoringAlignment from "@/hooks/gameplay/useScoringAlignment";
import useTakeScoring from "@/hooks/gameplay/useTakeScoring";
import usePitchSampler from "@/hooks/pitch/usePitchSampler";
import { useGameplaySession } from "@/hooks/gameplay/useGameplaySession";
import { makeOnsetsFromRhythm } from "@/utils/phrase/onsets";

// Vision settings + calibrated latency
import { useVisionEnabled } from "@/components/settings/vision/vision-layout";
import useVisionLatency from "@/hooks/vision/useVisionLatency";

// Narrow type for rhythm config to avoid `any`.
type RhythmConfig = {
  lineEnabled?: boolean;
  detectEnabled?: boolean;
};

type Props = {
  title?: string;
  sessionConfig?: SessionConfig;
  studentRowId?: string | null;
  rangeLowLabel?: string | null;
  rangeHighLabel?: string | null;
};

const CONF_THRESHOLD = 0.5;
const DEFAULT_PITCH_LATENCY_MS = 20;

type TakeSnapshot = {
  phrase: Phrase;
  rhythm: RhythmEvent[] | null;
  melodyRhythm: RhythmEvent[] | null;
};

export default function TrainingGame({
  title = "Training",
  sessionConfig = DEFAULT_SESSION_CONFIG,
  studentRowId = null,
  rangeLowLabel = null,
  rangeHighLabel = null,
}: Props) {
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

  // prefer-as-const: literal assertion instead of explicit string literal type
  const step = "play" as const;
  const {
    bpm, ts, leadBars, restBars, noteValue, noteDurSec, view,
    callResponseSequence, exerciseLoops, regenerateBetweenTakes,
    metronome, loopingMode, gestureLatencyMs = 90,
  } = sessionEff;

  const secPerBeat = secondsPerBeat(bpm, ts.den);
  const leadBeats = barsToBeats(leadBars, ts.num);
  const leadInSec = beatsToSeconds(leadBeats, bpm, ts.den);
  const restSec = beatsToSeconds(barsToBeats(restBars, ts.num), bpm, ts.den);

  const MAX_TAKES = Math.max(1, Number(exerciseLoops ?? 10));
  const MAX_SESSION_SEC = 15 * 60;

  // IO + generation
  const { pitch, confidence, isReady, error } = usePitchDetection("/models/swiftf0", {
    enabled: true, fps: 50, minDb: -45, smoothing: 2, centsTolerance: 3,
  });
  const liveHz = typeof pitch === "number" ? pitch : null;

  const [seedBump, setSeedBump] = useState(0);
  const fabric = useExerciseFabric({
    sessionConfig: sessionEff,
    lowHz: lowHz ?? null,
    highHz: highHz ?? null,
    seedBump,
  });
  const phrase: Phrase | null = fabric.phrase;

  const melodyClef = useMelodyClef({
    phrase, scale: sessionEff.scale, sessionConfig: sessionEff,
    lowHz: lowHz ?? null, highHz: highHz ?? null,
  });

  const genNoteDurSec =
    typeof noteValue === "string"
      ? beatsToSeconds(noteValueToBeats(noteValue, ts.den), bpm, ts.den)
      : (noteDurSec ?? secPerBeat);

  const fallbackPhraseSec = fabric.fallbackPhraseSec ?? genNoteDurSec * 8;
  const phraseSec =
    phrase?.notes?.length ? (phrase.durationSec ?? fallbackPhraseSec) : fallbackPhraseSec;
  const lastEndSec = phrase?.notes?.length
    ? phrase.notes.reduce((mx, n) => Math.max(mx, n.startSec + n.durSec), 0)
    : phraseSec;
  const recordWindowSec =
    Math.ceil(lastEndSec / Math.max(1e-9, ts.num * secPerBeat)) * (ts.num * secPerBeat);

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
    bpm, ts,
    scale: sessionEff.scale ?? { tonicPc: 0, name: "major" },
    lowHz: lowHz ?? null, highHz: highHz ?? null,
    player: { playA440: async (s) => { await playA440(s); }, playMidiList: async (m, d) => { await playMidiList(m, d); } },
  });

  const pretestRequired = (callResponseSequence?.length ?? 0) > 0;
  const pretestActive = pretestRequired && pretest.status !== "done";
  const exerciseUnlocked = !pretestRequired || pretest.status === "done";

  // Rhythm visibility + detection flags (from session config)
  const rhythmCfg = (sessionEff.rhythm ?? {}) as RhythmConfig;
  const rhythmLineEnabled = rhythmCfg.lineEnabled !== false;
  const rhythmDetectEnabled = rhythmCfg.detectEnabled !== false;

  // Global Vision toggle (settings)
  const { enabled: visionEnabled } = useVisionEnabled();

  // Only run vision when required by the exercise AND globally enabled
  const needVision =
    exerciseUnlocked && rhythmLineEnabled && rhythmDetectEnabled && visionEnabled;

  const { isRecording, start: startRec, stop: stopRec, startedAtMs, warm: warmRecorder } =
    useWavRecorder({ sampleRateOut: 16000, persistentStream: true });

  const loop = usePracticeLoop({
    step, lowHz: lowHz ?? null, highHz: highHz ?? null, phrase, words: fabric.words,
    windowOnSec: recordWindowSec, windowOffSec: restSec, preRollSec: leadInSec,
    maxTakes: MAX_TAKES, maxSessionSec: MAX_SESSION_SEC,
    isRecording, startedAtMs: startedAtMs ?? null,
    callResponse: false, callWindowSec: 0, onStartCall: undefined,
    onAdvancePhrase: () => { if (regenerateBetweenTakes && loopingMode) setSeedBump((n) => n + 1); },
    onEnterPlay: () => {},
    autoContinue: !!loopingMode,
    onRestComplete: () => {
      if (!loopingMode && regenerateBetweenTakes) setSeedBump((n) => n + 1);
    },
  });

  const shouldRecord = (pretestActive && pretest.shouldRecord) || (!pretestActive && loop.shouldRecord);
  useRecorderAutoSync({ enabled: step === "play", shouldRecord, isRecording, startRec, stopRec });

  useLeadInMetronome({
    enabled: exerciseUnlocked, metronome, leadBeats,
    loopPhase: loop.loopPhase, anchorMs: loop.anchorMs,
    playLeadInTicks, secPerBeat,
  });

  const calibratedLatencyMs = useVisionLatency(gestureLatencyMs);

  // Match setup thresholds
  const hand = useHandBeat({
    latencyMs: calibratedLatencyMs ?? gestureLatencyMs,
    fireUpEps: 0.004,
    confirmUpEps: 0.012,
    downRearmEps: 0.006,
    refractoryMs: 90,
    noiseEps: 0.0015,
    minUpVel: 0.25,
  });

  const samplerActive: boolean = !pretestActive && loop.loopPhase === "record";
  const samplerAnchor: number | null = !pretestActive ? (loop.anchorMs ?? null) : null;
  const sampler = usePitchSampler({ active: samplerActive, anchorMs: samplerAnchor, hz: liveHz, confidence, fps: 60 });

  useEffect(() => {
    (async () => {
      try { await warmPlayer(); } catch {}
      try { await warmRecorder(); } catch {}
    })();
  }, [warmPlayer, warmRecorder]);

  // Start/stop vision loop respecting the global toggle
  useEffect(() => {
    if (!needVision || pretestActive) { hand.stop(); return; }
    (async () => {
      try {
        await hand.preload();
        if (!hand.isRunning) await hand.start(performance.now());
      } catch {}
    })();
    return () => { if (!needVision || pretestActive) hand.stop(); };
  }, [needVision, pretestActive, hand]);

  useEffect(() => {
    if (pretestActive || !needVision) return;
    if (loop.loopPhase === "lead-in") {
      const a = loop.anchorMs ?? performance.now();
      hand.reset(a);
      sampler.reset();
    }
  }, [pretestActive, needVision, loop.loopPhase, loop.anchorMs, hand, sampler]);

  const rhythmEffective: RhythmEvent[] | null = fabric.syncRhythmFabric ?? null;
  const haveRhythm: boolean = rhythmLineEnabled && (rhythmEffective?.length ?? 0) > 0;

  const { sessionScores, scoreTake } = useTakeScoring();
  const alignForScoring = useScoringAlignment();

  const [takeSnapshots, setTakeSnapshots] = useState<TakeSnapshot[]>([]);
  const phraseForTakeRef = useRef<Phrase | null>(null);
  const rhythmForTakeRef = useRef<RhythmEvent[] | null>(null);
  const melodyRhythmForTakeRef = useRef<RhythmEvent[] | null>(null);

  useEffect(() => {
    if (!pretestActive && loop.loopPhase === "lead-in" && phrase) {
      phraseForTakeRef.current = phrase;
      rhythmForTakeRef.current = rhythmEffective;
      melodyRhythmForTakeRef.current = fabric.melodyRhythm ?? null;
    }
  }, [pretestActive, loop.loopPhase, phrase, rhythmEffective, fabric.melodyRhythm]);

  const prevPhaseRef = useRef(loop.loopPhase);
  useEffect(() => {
    const prev = prevPhaseRef.current;
    const curr = loop.loopPhase;
    prevPhaseRef.current = curr;

    if (!pretestActive && prev === "record" && curr === "rest") {
      const usedPhrase = phraseForTakeRef.current ?? phrase;
      const usedRhythm = rhythmForTakeRef.current ?? rhythmEffective;
      if (usedPhrase) {
        const pitchLagSec = (DEFAULT_PITCH_LATENCY_MS || 0) / 1000;
        // Gesture latency is compensated inside useHandBeat via latencyMs
        const gestureLagSec = 0;

        void scoreTake({
          phrase: usedPhrase,
          bpm, den: ts.den, leadInSec,
          pitchLagSec, gestureLagSec,
          snapshotSamples: () => sampler.snapshot(),
          snapshotBeats: () => hand.snapshotEvents(),
          melodyOnsetsSec: usedPhrase.notes.map((n) => n.startSec),
          rhythmOnsetsSec: makeOnsetsFromRhythm(usedRhythm, bpm, ts.den),
          align: alignForScoring,
        });
        setTakeSnapshots((xs) => [
          ...xs,
          {
            phrase: usedPhrase,
            rhythm: usedRhythm ?? null,
            melodyRhythm: melodyRhythmForTakeRef.current ?? null,
          },
        ]);
      }
    }
  }, [
    loop.loopPhase,
    pretestActive,
    phrase,
    bpm,
    ts.den,
    leadInSec,
    loopingMode,
    alignForScoring,
    sampler,
    hand,
    rhythmEffective,
    scoreTake,
  ]);

  const showLyrics = step === "play" && !!fabric.words?.length;
  const readinessError =
    (rangeError ? `Range load failed: ${rangeError}` :
    (!rangeLoading && (lowHz == null || highHz == null) ? "No saved range found. Please set your vocal range first." : null));

  const showExercise = !pretestActive;
  const running = showExercise && loop.running;
  const startAtMs = showExercise ? loop.anchorMs : null;
  const statusText = pretestActive ? pretest.currentLabel : loop.statusText;

  const uiRunning = pretestActive ? running : (loop.loopPhase !== "rest" ? running : false);
  const onToggleExercise = () => {
    if (!(!pretestRequired || pretest.status === "done")) return;
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

  const sidePanel = {
    pretest: {
      active: pretestActive,
      statusText,
      running: pretest.running,
      inResponse: pretest.status === "response",
      modeKind: currentPretestKind,
      start: () => { loop.clearAll(); stopPlayback(); stopRec().catch(() => {}); pretest.start(); },
      continueResponse: pretest.continueResponse,
      bpm,
      tsNum: ts.num,
      tonicPc: sessionEff.scale?.tonicPc ?? 0,
      lowHz: lowHz ?? null,
      scaleName: sessionEff.scale?.name ?? "major",
      liveHz,
      confidence,
      playMidiList,
    },
    scores: sessionScores,
    snapshots: takeSnapshots,
    currentPhrase: phrase,
    currentRhythm: rhythmEffective,
    haveRhythm,
    player: { playPhrase, playRhythm, playMelodyAndRhythm, stop: stopPlayback },
    bpm, den: ts.den, tsNum: ts.num,
    tonicPc: sessionEff.scale?.tonicPc ?? 0,
    scaleName: sessionEff.scale?.name ?? "major",
  } as const;

  return (
    <GameLayout
      title={title}
      error={error || readinessError}
      running={running}
      uiRunning={uiRunning}
      onToggle={onToggleExercise}
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
      rhythm={rhythmEffective ?? undefined}
      melodyRhythm={fabric.melodyRhythm ?? undefined}
      bpm={bpm}
      den={ts.den}
      tsNum={ts.num}
      keySig={fabric.keySig}
      view={view}
      clef={melodyClef}
      lowHz={lowHz ?? null}
      highHz={highHz ?? null}
      sessionPanel={footerSessionPanel}
      sidePanel={sidePanel}

      // 🔑 Mode-aware grid labels (rotating solfege)
      tonicPc={sessionEff.scale?.tonicPc ?? null}
      scaleName={sessionEff.scale?.name ?? null}
    />
  );
}
