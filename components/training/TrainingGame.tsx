// components/training/TrainingGame.tsx
"use client";
import React, { useRef, useState, useEffect } from "react";
import GameLayout from "./layout/GameLayout";
import { SessionPanel, PretestPanel } from "./session";
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

// alignment + scoring
import useScoringAlignment from "@/hooks/gameplay/useScoringAlignment";
import useTakeScoring from "@/hooks/gameplay/useTakeScoring";

// ✅ steady-cadence pitch sampler (rAF)
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
// SwiftF0 window ≈ 0.20s ⇒ ~0.10–0.12s group delay (+ a touch for smoothing)
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
    bpm,
    ts,
    leadBars,
    restBars,
    noteValue,
    noteDurSec,
    view,
    callResponseSequence,
    exerciseLoops,
    regenerateBetweenTakes,
    metronome,
    loopingMode,
    gestureLatencyMs = 90,
  } = sessionConfig;

  const secPerBeat = secondsPerBeat(bpm, ts.den);
  const secPerBar = ts.num * secPerBeat;
  const leadBeats = barsToBeats(leadBars, ts.num);
  const leadInSec = beatsToSeconds(leadBeats, bpm, ts.den);
  const restBeats = barsToBeats(restBars, ts.num);
  const restSec = beatsToSeconds(restBeats, bpm, ts.den);

  const MAX_TAKES = Math.max(1, Number(exerciseLoops ?? 24));
  const MAX_SESSION_SEC = 15 * 60;

  // ---- Pitch (real-time) ----
  const { pitch, confidence, isReady, error } = usePitchDetection("/models/swiftf0", {
    enabled: true,
    fps: 50,
    minDb: -45,
    smoothing: 2,
    centsTolerance: 3,
  });
  const liveHz = typeof pitch === "number" ? pitch : null;

  // Regeneration seed between takes
  const [seedBump, setSeedBump] = useState(0);

  // ---- Build the exercise (phrase, rhythms, lyrics, key) ----
  const fabric = useExerciseFabric({
    sessionConfig,
    lowHz: lowHz ?? null,
    highHz: highHz ?? null,
    seedBump,
  });

  const phrase: Phrase | null = fabric.phrase;

  // Clef (stable)
  const melodyClef = useMelodyClef({
    phrase,
    scale: sessionConfig.scale,
    sessionConfig,
    lowHz: lowHz ?? null,
    highHz: highHz ?? null,
  });

  // Derived time windows
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

  const recordWindowSec = Math.ceil(lastEndSec / Math.max(1e-9, secPerBar)) * secPerBar;

  // ---- Audio player + pretest ----
  const { playA440, playMidiList, playLeadInTicks, playPhrase, playRhythm, playMelodyAndRhythm, stop: stopPlayback } =
    usePhrasePlayer();

  const pretest = usePretest({
    sequence: callResponseSequence ?? [],
    bpm,
    ts,
    scale: sessionConfig.scale ?? { tonicPc: 0, name: "major" },
    lowHz: lowHz ?? null,
    highHz: highHz ?? null,
    player: {
      playA440: async (durSec) => {
        await playA440(durSec);
      },
      playMidiList: async (midi, noteDurSec) => {
        await playMidiList(midi, noteDurSec);
      },
    },
  });

  const [pretestDismissed, setPretestDismissed] = useState(false);
  const pretestActive =
    (callResponseSequence?.length ?? 0) > 0 && !pretestDismissed && pretest.status !== "done";

  // ---- Practice loop ----
  const { isRecording, start: startRec, stop: stopRec, startedAtMs } = useWavRecorder({
    sampleRateOut: 16000,
  });

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

    onAdvancePhrase: () => {
      if (regenerateBetweenTakes && loopingMode) setSeedBump((n) => n + 1);
    },

    onEnterPlay: () => {},

    autoContinue: !!loopingMode,
    onRestComplete: () => {
      if (!loopingMode) setReviewVisible(true);
    },
  });

  // ---- Recorder auto start/stop
  const shouldRecord = (pretestActive && pretest.shouldRecord) || (!pretestActive && loop.shouldRecord);

  useRecorderAutoSync({
    enabled: step === "play",
    shouldRecord,
    isRecording,
    startRec,
    stopRec,
  });

  // ---- Metronome lead-in
  const leadBeatsNum = leadBeats;
  useLeadInMetronome({
    enabled: !pretestActive,
    metronome,
    leadBeats: leadBeatsNum,
    loopPhase: loop.loopPhase,
    anchorMs: loop.anchorMs,
    playLeadInTicks,
    secPerBeat,
  });

  // ---- Hand-gesture beat detection (use your new flick API + calibrated latency)
  const [gestureLatencyMsEff, setGestureLatencyMsEff] = useState<number>(gestureLatencyMs);
  useEffect(() => {
    try {
      const raw = localStorage.getItem("vision:latency-ms");
      const n = raw == null ? NaN : Number(raw);
      setGestureLatencyMsEff(Number.isFinite(n) && n >= 0 ? Math.round(n) : gestureLatencyMs);
    } catch {
      setGestureLatencyMsEff(gestureLatencyMs);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // ✅ steady-cadence pitch sampler (wired with definite booleans)
  const samplerActive: boolean = !pretestActive && loop.loopPhase === "record";
  const samplerAnchor: number | null = !pretestActive ? (loop.anchorMs ?? null) : null;

  const sampler = usePitchSampler({
    active: samplerActive,
    anchorMs: samplerAnchor,
    hz: liveHz,
    confidence,
    fps: 60,
  });

  // start/stop gesture capture + reset sampler on phase changes
  useEffect(() => {
    // During pretest we fully stop (no need for camera).
    if (pretestActive) {
      hand.stop();
      return;
    }

    if (loop.loopPhase === "record") {
      hand.start(loop.anchorMs ?? performance.now());
      sampler.reset();
    } else {
      // Between takes (rest/review), keep the stream alive to avoid camera glitches.
      hand.pause();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pretestActive, loop.loopPhase, loop.anchorMs]);

  // ensure full teardown if this page unmounts
  useEffect(() => {
    return () => {
      hand.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- Review + scoring state
  const haveRhythm: boolean = ((fabric.melodyRhythm?.length ?? 0) > 0) || ((fabric.syncRhythmFabric?.length ?? 0) > 0);

  const { lastScore, sessionScores, scoreTake } = useTakeScoring();
  const alignForScoring = useScoringAlignment();

  // helper: turn rhythm fabric into onsets (phrase-relative)
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

  // 🔔 Compute score exactly when a take ends (record → rest), regardless of looping.
  const prevPhaseRef = useRef(loop.loopPhase);
  useEffect(() => {
    const prev = prevPhaseRef.current;
    const curr = loop.loopPhase;
    prevPhaseRef.current = curr;

    // only score main gameplay (not pretest), and only when we just left "record"
    if (!pretestActive && phrase && prev === "record" && curr === "rest") {
      const pitchLagSec = (DEFAULT_PITCH_LATENCY_MS || 0) / 1000;
      const gestureLagSec = Math.max(0, (gestureLatencyMsEff ?? 0) / 1000);

      void scoreTake({
        phrase,
        bpm,
        den: ts.den,
        leadInSec,
        pitchLagSec,
        gestureLagSec,
        snapshotSamples: () => sampler.snapshot(),             // PitchSample[]
        snapshotBeats: () => hand.snapshotEvents(),            // number[]
        melodyOnsetsSec: phrase.notes.map((n) => n.startSec),  // phrase-relative
        rhythmOnsetsSec: makeOnsetsFromRhythm(fabric.syncRhythmFabric ?? null),
        align: alignForScoring,
      });

      // if we’re in review mode (no looping), show the panel
      if (!loopingMode) {
        setReviewVisible(true);
      }
    }
  }, [
    loop.loopPhase,
    pretestActive,
    phrase,
    bpm,
    ts.den,
    leadInSec,
    gestureLatencyMsEff,
    loopingMode,
    alignForScoring,
    sampler,
    hand,
    fabric.syncRhythmFabric,
    scoreTake,
  ]);

  const onNextPhrase = () => {
    setSeedBump((n) => n + 1);
    setReviewVisible(false);
  };

  // ---- UI plumbing
  const showLyrics = step === "play" && !!fabric.words?.length;
  const readinessError = rangeError
    ? `Range load failed: ${rangeError}`
    : !rangeLoading && (lowHz == null || highHz == null)
    ? "No saved range found. Please set your vocal range first."
    : null;

  const running = pretestActive ? pretest.running : loop.running;
  const startAtMs = pretestActive ? pretest.anchorMs : loop.anchorMs;
  const statusText = pretestActive ? pretest.currentLabel : loop.statusText;

  const onPlayMelody = async () => {
    if (!phrase) return;
    await playPhrase(phrase, { bpm, tsNum: ts.num, tsDen: ts.den, leadBars: 0, metronome: false });
  };
  const onPlayRhythm = async () => {
    if (!haveRhythm) return;
    const rhythmToUse = (fabric.melodyRhythm?.length ? fabric.melodyRhythm : fabric.syncRhythmFabric ?? []) as any[];
    await playRhythm(rhythmToUse as any, { bpm, tsNum: ts.num, tsDen: ts.den, leadBars: 0 });
  };
  const onPlayBoth = async () => {
    if (!phrase) return;
    const rhythmToUse = (fabric.melodyRhythm?.length ? fabric.melodyRhythm : fabric.syncRhythmFabric ?? []) as any[];
    await playMelodyAndRhythm(phrase, rhythmToUse as any, {
      bpm,
      tsNum: ts.num,
      tsDen: ts.den,
      metronome: true,
    });
  };
  const onStopPlayback = () => stopPlayback();

  // ---- Render
  return (
    <GameLayout
      title={title}
      error={error || readinessError}
      running={running}
      onToggle={loop.toggle}
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
          score={lastScore || undefined}
          sessionScores={sessionScores}
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
        <div className="mt-2 rounded-lg border border-[#d2d2d2] bg-[#ebebeb] p-3">...</div>
      ) : null}
    </GameLayout>
  );
}
