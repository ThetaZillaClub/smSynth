// components/training/TrainingGame.tsx
"use client";
import React, { useRef, useState, useEffect } from "react";
import GameLayout from "./layout/GameLayout";
import { PretestPanel } from "./session"; // ⬅️ removed SessionPanel import
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
  noteValueToSeconds,
} from "@/utils/time/tempo";
import type { Phrase } from "@/utils/stage";
import { type SessionConfig, DEFAULT_SESSION_CONFIG } from "./session";
import usePretest from "@/hooks/gameplay/usePretest";
import { useExerciseFabric } from "@/hooks/gameplay/useExerciseFabric";
import { useMelodyClef } from "@/hooks/gameplay/useMelodyClef";
import { useLeadInMetronome } from "@/hooks/gameplay/useLeadInMetronome";
import TakeReview from "@/components/training/take-review-layout/TakeReview";
import useHandBeat from "@/hooks/vision/useHandBeat";
import type { RhythmEvent } from "@/utils/phrase/phraseTypes";
import useScoringAlignment from "@/hooks/gameplay/useScoringAlignment";
import useTakeScoring from "@/hooks/gameplay/useTakeScoring";
import usePitchSampler from "@/hooks/pitch/usePitchSampler";

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
const DEFAULT_PITCH_LATENCY_MS = 120;

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
  const { lowHz, highHz, loading: rangeLoading, error: rangeError } = useStudentRange(
    studentRowId,
    { rangeLowLabel, rangeHighLabel }
  );

  const step: "play" = "play";
  const {
    bpm, ts, leadBars, restBars, noteValue, noteDurSec, view,
    callResponseSequence, exerciseLoops, regenerateBetweenTakes,
    metronome, loopingMode, gestureLatencyMs = 90,
  } = sessionConfig;

  const secPerBeat = secondsPerBeat(bpm, ts.den);
  const leadBeats = barsToBeats(leadBars, ts.num);
  const leadInSec = beatsToSeconds(leadBeats, bpm, ts.den);
  const restBeats = barsToBeats(restBars, ts.num);
  const restSec = beatsToSeconds(restBeats, bpm, ts.den);

  const MAX_TAKES = Math.max(1, Number(exerciseLoops ?? 24));
  const MAX_SESSION_SEC = 15 * 60;

  // ---- Pitch (always-on detector; hot idle) ----
  const { pitch, confidence, isReady, error } = usePitchDetection("/models/swiftf0", {
    enabled: true,
    fps: 50,
    minDb: -45,
    smoothing: 2,
    centsTolerance: 3,
  });
  const liveHz = typeof pitch === "number" ? pitch : null;

  const [seedBump, setSeedBump] = useState(0);

  const fabric = useExerciseFabric({
    sessionConfig,
    lowHz: lowHz ?? null,
    highHz: highHz ?? null,
    seedBump,
  });
  const phrase: Phrase | null = fabric.phrase;

  const melodyClef = useMelodyClef({
    phrase,
    scale: sessionConfig.scale,
    sessionConfig,
    lowHz: lowHz ?? null,
    highHz: highHz ?? null,
  });

  const genNoteDurSec =
    typeof noteValue === "string"
      ? beatsToSeconds(noteValueToBeats(noteValue, ts.den), bpm, ts.den)
      : noteDurSec ?? secPerBeat;

  const fallbackPhraseSec = fabric.fallbackPhraseSec ?? genNoteDurSec * 8;
  const phraseSec =
    phrase?.notes?.length ? phrase.durationSec ?? fallbackPhraseSec : fallbackPhraseSec;
  const lastEndSec = phrase?.notes?.length
    ? phrase.notes.reduce((mx, n) => Math.max(mx, n.startSec + n.durSec), 0)
    : phraseSec;
  const recordWindowSec =
    Math.ceil(lastEndSec / Math.max(1e-9, ts.num * secPerBeat)) * (ts.num * secPerBeat);

  // ---- Audio player + pretest ----
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
    scale: sessionConfig.scale ?? { tonicPc: 0, name: "major" },
    lowHz: lowHz ?? null,
    highHz: highHz ?? null,
    player: {
      playA440: async (durSec) => { await playA440(durSec); },
      playMidiList: async (midi, noteDurSec) => { await playMidiList(midi, noteDurSec); },
    },
  });

  const pretestRequired = (callResponseSequence?.length ?? 0) > 0;
  const pretestActive = pretestRequired && pretest.status !== "done";
  const exerciseUnlocked = !pretestRequired || pretest.status === "done";

  // ---- Rhythm / vision gating ----
  const rhythmCfgAny = (sessionConfig.rhythm ?? {}) as any;
  const rhythmLineEnabled = rhythmCfgAny.lineEnabled !== false;
  const rhythmDetectEnabled = rhythmCfgAny.detectEnabled !== false;
  const needVision = exerciseUnlocked && rhythmLineEnabled && rhythmDetectEnabled;

  // ---- Recorder (persistent pipeline; gated capture) ----
  const {
    isRecording,
    start: startRec,
    stop: stopRec,
    startedAtMs,
    warm: warmRecorder,
  } = useWavRecorder({ sampleRateOut: 16000, persistentStream: true });

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
    onAdvancePhrase: () => { if (regenerateBetweenTakes && loopingMode) setSeedBump((n) => n + 1); },
    onEnterPlay: () => {},
    autoContinue: !!loopingMode,
    onRestComplete: () => { if (!loopingMode) setReviewVisible(true); },
  });

  // 🔒 enter pretest with everything silenced
  const startPretestSafe = async () => {
    loop.clearAll();
    stopPlayback();
    await stopRec().catch(() => {});
    pretest.start();
  };

  // ---- Recorder auto-sync
  const shouldRecord = (pretestActive && pretest.shouldRecord) || (!pretestActive && loop.shouldRecord);
  useRecorderAutoSync({
    enabled: step === "play",
    shouldRecord,
    isRecording,
    startRec,
    stopRec,
  });

  // ---- Lead-in metronome (scheduling only)
  useLeadInMetronome({
    enabled: exerciseUnlocked,
    metronome,
    leadBeats,
    loopPhase: loop.loopPhase,
    anchorMs: loop.anchorMs,
    playLeadInTicks,
    secPerBeat,
  });

  // ---- Hand-gesture detection (hot idle; re-anchor at lead-in) ----
  const [gestureLatencyMsEff, setGestureLatencyMsEff] = useState<number>(gestureLatencyMs);
  useEffect(() => {
    try {
      const raw = localStorage.getItem("vision:latency-ms");
      const n = raw == null ? NaN : Number(raw);
      setGestureLatencyMsEff(Number.isFinite(n) && n >= 0 ? Math.round(n) : gestureLatencyMs);
    } catch {
      setGestureLatencyMsEff(gestureLatencyMs);
    }
  }, [gestureLatencyMs]);

  const hand = useHandBeat({
    latencyMs: gestureLatencyMsEff,
    fireUpEps: 0.004,
    confirmUpEps: 0.012,
    downRearmEps: 0.006,
    refractoryMs: 90,
    noiseEps: 0.0015,
    minUpVel: 0.35,
  });

  // ✅ steady-cadence pitch sampler
  const samplerActive: boolean = !pretestActive && loop.loopPhase === "record";
  const samplerAnchor: number | null = !pretestActive ? loop.anchorMs ?? null : null;
  const sampler = usePitchSampler({ active: samplerActive, anchorMs: samplerAnchor, hz: liveHz, confidence, fps: 60 });

  // 🔥 Warm audio pieces once (simple)
  useEffect(() => {
    (async () => {
      try { await warmPlayer(); } catch {}
      try { await warmRecorder(); } catch {}
    })();
  }, [warmPlayer, warmRecorder]);

  // 🟦 Start camera/graph once when vision becomes relevant (hot idle).
  useEffect(() => {
    if (!needVision || pretestActive) { hand.stop(); return; }

    (async () => {
      try {
        await hand.preload();
        if (!hand.isRunning) await hand.start(performance.now());
      } catch {}
    })();

    return () => {
      if (!needVision || pretestActive) hand.stop();
    };
  }, [needVision, pretestActive, hand]);

  // 🟦 On each take, only re-anchor at the start of LEAD-IN (no start/stop here).
  useEffect(() => {
    if (pretestActive || !needVision) return;

    if (loop.loopPhase === "lead-in") {
      const a = loop.anchorMs ?? performance.now();
      hand.reset(a);
      sampler.reset();
    }
  }, [pretestActive, needVision, loop.loopPhase, loop.anchorMs, hand, sampler]);

  // ---- Review + scoring
  const haveRhythm: boolean =
    (fabric.melodyRhythm?.length ?? 0) > 0 || (fabric.syncRhythmFabric?.length ?? 0) > 0;
  const { lastScore, sessionScores, scoreTake } = useTakeScoring();
  const alignForScoring = useScoringAlignment();

  const makeOnsetsFromRhythm = (rh: RhythmEvent[] | null | undefined): number[] => {
    if (!rh?.length) return [];
    const out: number[] = [];
    let t = 0;
    for (const ev of rh) {
      const dur = noteValueToSeconds(ev.value, bpm, ts.den);
      if (ev.type === "note") out.push(t);
      t += dur;
    }
    return out;
  };

  const prevPhaseRef = useRef(loop.loopPhase);
  useEffect(() => {
    const prev = prevPhaseRef.current;
    const curr = loop.loopPhase;
    prevPhaseRef.current = curr;

    if (!pretestActive && phrase && prev === "record" && curr === "rest") {
      const pitchLagSec = (DEFAULT_PITCH_LATENCY_MS || 0) / 1000;
      const gestureLagSec = 0; // already latency-compensated in useHandBeat

      void scoreTake({
        phrase,
        bpm,
        den: ts.den,
        leadInSec,
        pitchLagSec,
        gestureLagSec,
        snapshotSamples: () => sampler.snapshot(),
        snapshotBeats: () => hand.snapshotEvents(),
        melodyOnsetsSec: phrase.notes.map((n) => n.startSec),
        rhythmOnsetsSec: makeOnsetsFromRhythm(fabric.syncRhythmFabric ?? null),
        align: alignForScoring,
      });

      if (!loopingMode) setReviewVisible(true);
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
    fabric.syncRhythmFabric,
    scoreTake,
  ]);

  const onNextPhrase = () => { setSeedBump((n) => n + 1); setReviewVisible(false); };

  // ---- UI plumbing
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

  const onPlayMelody = async () => { if (phrase) await playPhrase(phrase, { bpm, tsNum: ts.num, tsDen: ts.den, leadBars: 0, metronome: false }); };
  const onPlayRhythm = async () => {
    if (!haveRhythm) return;
    const rhythmToUse = (fabric.melodyRhythm?.length ? fabric.melodyRhythm : fabric.syncRhythmFabric ?? []) as any[];
    await playRhythm(rhythmToUse as any, { bpm, tsNum: ts.num, tsDen: ts.den, leadBars: 0 });
  };
  const onPlayBoth = async () => {
    if (!phrase) return;
    const rhythmToUse = (fabric.melodyRhythm?.length ? fabric.melodyRhythm : fabric.syncRhythmFabric ?? []) as any[];
    await playMelodyAndRhythm(phrase, rhythmToUse as any, { bpm, tsNum: ts.num, tsDen: ts.den, metronome: true });
  };
  const onStopPlayback = () => stopPlayback();

  const uiRunning = pretestActive ? running : loop.loopPhase !== "rest" ? running : false;
  const onToggleExercise = () => { if (exerciseUnlocked) loop.toggle(); };

  // 👉 Footer session panel props (BPM, Time, Round)
  const showFooterSessionPanel = !!phrase && !pretestActive && !reviewVisible;

  // Try to derive a 0-based current take index from the loop; fall back to 0.
  const rawTakeIdx =
    (loop as any).takeIndex ??
    (loop as any).takeIdx ??
    (loop as any).take ??
    (loop as any).takesDone ??
    0;

  const roundCurrent = Math.max(1, Math.min(MAX_TAKES, Number(rawTakeIdx) + 1));
  const footerSessionPanel = showFooterSessionPanel
    ? {
        bpm,
        ts,
        roundCurrent,
        roundTotal: MAX_TAKES,
      }
    : undefined;

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
      sessionPanel={footerSessionPanel}  // ⬅️ only BPM / Time / Round
    >
      {pretestActive ? (
        <PretestPanel
          statusText={statusText}
          detail="Call & Response runs first. After you finish, the exercise will unlock and start with a metronome lead-in."
          running={pretest.running}
          onStart={startPretestSafe}
          onContinue={pretest.continueResponse}
          onReset={() => { stopPlayback(); pretest.reset(); }}
        />
      ) : reviewVisible ? (
        <TakeReview
          haveRhythm={haveRhythm}
          onPlayMelody={onPlayMelody}
          onPlayRhythm={onPlayRhythm}
          onPlayBoth={onPlayBoth}
          onStop={onStopPlayback}
          onNext={onNextPhrase}
          score={lastScore || undefined}
          sessionScores={sessionScores}
        />
      ) : null}
    </GameLayout>
  );
}