// components/training/TrainingGame.tsx
"use client";
import React, { useRef, useState, useEffect, useMemo, useCallback } from "react";
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
import { hzToMidi, midiToNoteName } from "@/utils/pitch/pitchMath";
import type { TakeScore } from "@/utils/scoring/score";
import { letterFromPercent } from "@/utils/scoring/grade";
import { pcToSolfege, type SolfegeScaleName } from "@/utils/lyrics/solfege";
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

  /** Optional: identify a lesson + session so we can submit takes */
  lessonSlug?: string | null;
  sessionId?: string | null;
};

const CONF_THRESHOLD = 0.5;
const DEFAULT_PITCH_LATENCY_MS = 20;

type TakeSnapshot = {
  phrase: Phrase;
  rhythm: RhythmEvent[] | null;
  melodyRhythm: RhythmEvent[] | null;
};

/** Helper: triad offsets per scale (matches pretest components) */
function triadOffsetsForScale(name?: string | null) {
  const minorish = new Set([
    "minor",
    "aeolian",
    "natural_minor",
    "dorian",
    "phrygian",
    "harmonic_minor",
    "melodic_minor",
    "minor_pentatonic",
  ]);
  const third = name && minorish.has(name) ? 3 : 4;
  const fifth = name === "locrian" ? 6 : 7;
  return { third, fifth };
}

// ───────────────────────── session aggregation helpers ─────────────────────────
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const r2 = (x: number) => Math.round(x * 100) / 100;
const mean = (arr: number[]) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);

function intervalLabel(semitones: number): string {
  switch (semitones) {
    case 0: return "P1";
    case 1: return "m2";
    case 2: return "M2";
    case 3: return "m3";
    case 4: return "M3";
    case 5: return "P4";
    case 6: return "TT";
    case 7: return "P5";
    case 8: return "m6";
    case 9: return "M6";
    case 10: return "m7";
    case 11: return "M7";
    case 12: return "P8";
    default: return `${semitones}`;
  }
}

/**
 * Aggregate multiple takes into a single TakeScore suitable for submission.
 * Provides all required scalar fields for RhythmScore and IntervalScore,
 * and leaves the detail arrays empty but correctly typed.
 */
function aggregateForSubmission(scores: TakeScore[]): TakeScore {
  // Top-level means
  const finalPct = mean(scores.map((s) => s.final.percent));
  const pitchPct = mean(scores.map((s) => s.pitch.percent));
  const pitchOn = clamp01(mean(scores.map((s) => s.pitch.timeOnPitchRatio)));
  const pitchMae = mean(scores.map((s) => s.pitch.centsMae));
  const melPct = mean(scores.map((s) => s.rhythm.melodyPercent));

  // Rhythm extras (hit rates and mean abs error), derived from per-take details when present,
  // otherwise fall back to percent-based approximations.
  const melodyCoverages: number[] = [];
  const melodyAbsErrs: number[] = [];
  const lineHits: number[] = [];
  const lineAbsErrs: number[] = [];
  let anyLineEvaluated = false;

  for (const s of scores) {
    (s.rhythm.perNoteMelody ?? []).forEach((r) => {
      if (typeof r.coverage === "number") melodyCoverages.push(r.coverage);
      if (typeof r.onsetErrMs === "number" && Number.isFinite(r.onsetErrMs)) {
        melodyAbsErrs.push(Math.abs(r.onsetErrMs));
      }
    });
    if (s.rhythm.lineEvaluated) {
      anyLineEvaluated = true;
      (s.rhythm.linePerEvent ?? []).forEach((e) => {
        lineHits.push((e.credit ?? 0) > 0 ? 1 : 0);
        if (typeof e.errMs === "number" && Number.isFinite(e.errMs)) {
          lineAbsErrs.push(Math.abs(e.errMs));
        }
      });
    }
  }

  const melodyHitRate = melodyCoverages.length
    ? clamp01(mean(melodyCoverages))
    : clamp01(melPct / 100);

  const melodyMeanAbsMs = melodyAbsErrs.length ? Math.round(mean(melodyAbsErrs)) : 0;

  const avgLinePct = mean(scores.filter((s) => s.rhythm.lineEvaluated).map((s) => s.rhythm.linePercent));
  const lineHitRate = lineHits.length ? clamp01(mean(lineHits)) : clamp01((avgLinePct || 0) / 100);
  const lineMeanAbsMs = lineAbsErrs.length ? Math.round(mean(lineAbsErrs)) : 0;

  const linePercent = anyLineEvaluated ? r2(avgLinePct || 0) : 0;
  const lineEvaluated = anyLineEvaluated;

  // combinedPercent: if a line was evaluated, average melody+line; otherwise melody only.
  const combinedPercent = lineEvaluated ? r2((melPct + linePercent) / 2) : r2(melPct);

  // Intervals by class: sum attempts/correct across all takes
  const byClass = new Map<number, { attempts: number; correct: number }>();
  for (let i = 0; i <= 12; i++) byClass.set(i, { attempts: 0, correct: 0 });
  scores.forEach((s) => {
    (s.intervals.classes ?? []).forEach((c) => {
      const cell = byClass.get(c.semitones)!;
      cell.attempts += c.attempts || 0;
      cell.correct += c.correct || 0;
    });
  });

  const intervalsClasses: TakeScore["intervals"]["classes"] = Array.from(byClass.entries())
    .filter(([, v]) => v.attempts > 0)
    .map(([semitones, v]) => ({
      semitones,
      attempts: v.attempts,
      correct: v.correct,
      label: intervalLabel(semitones),
      percent: v.attempts > 0 ? r2((v.correct / v.attempts) * 100) : 0,
    }));

  const intervalsTotal = intervalsClasses.reduce((acc, c) => acc + c.attempts, 0);
  const intervalsCorrect = intervalsClasses.reduce((acc, c) => acc + c.correct, 0);
  const intervalsRatio = intervalsTotal > 0 ? clamp01(intervalsCorrect / intervalsTotal) : 0;

  // Build the TakeScore with correctly typed empty arrays for details we aren’t aggregating here
  const perNotePitchEmpty: TakeScore["pitch"]["perNote"] = [];
  const perNoteMelodyEmpty: TakeScore["rhythm"]["perNoteMelody"] = [];
  const linePerEventEmpty: TakeScore["rhythm"]["linePerEvent"] = [];

  return {
    final: { percent: r2(finalPct), letter: letterFromPercent(finalPct) },
    pitch: {
      percent: r2(pitchPct),
      timeOnPitchRatio: r2(pitchOn),
      centsMae: r2(pitchMae),
      perNote: perNotePitchEmpty,
    },
    rhythm: {
      melodyPercent: r2(melPct),
      melodyHitRate,
      melodyMeanAbsMs,
      lineEvaluated,
      linePercent,
      lineHitRate,
      lineMeanAbsMs,
      combinedPercent,
      perNoteMelody: perNoteMelodyEmpty,
      linePerEvent: linePerEventEmpty,
    },
    intervals: {
      total: intervalsTotal,
      correct: intervalsCorrect,
      correctRatio: r2(intervalsRatio),
      classes: intervalsClasses,
    },
  };
}

export default function TrainingGame({
  title = "Training",
  sessionConfig = DEFAULT_SESSION_CONFIG,
  studentRowId = null,
  rangeLowLabel = null,
  rangeHighLabel = null,
  lessonSlug = null,
  sessionId = null,
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
  const sampler = usePitchSampler({
    active: samplerActive,
    anchorMs: samplerAnchor,
    hz: liveHz,
    confidence,
    fps: 60,
  });

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

  const { sessionScores, scoreTake } = useTakeScoring(); // no submit helper here
  const alignForScoring = useScoringAlignment();

  const [takeSnapshots, setTakeSnapshots] = useState<TakeSnapshot[]>([]);
  const phraseForTakeRef = useRef<Phrase | null>(null);
  const rhythmForTakeRef = useRef<RhythmEvent[] | null>(null);
  const melodyRhythmForTakeRef = useRef<RhythmEvent[] | null>(null);
  const sessionSubmittedRef = useRef(false);

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
        const gestureLagSec = 0;

        const score = scoreTake({
          phrase: usedPhrase,
          bpm,
          den: ts.den,
          leadInSec,
          pitchLagSec,
          gestureLagSec,
          snapshotSamples: () => sampler.snapshot(),
          snapshotBeats: () => hand.snapshotEvents(),
          melodyOnsetsSec: usedPhrase.notes.map((n) => n.startSec),
          rhythmOnsetsSec: makeOnsetsFromRhythm(usedRhythm, bpm, ts.den),
          align: alignForScoring,
        });

        // Submit ONE aggregated row when exerciseLoops reached
        const totalTakesNow = sessionScores.length + 1; // include this score
        const maxTakes = Math.max(1, Number(exerciseLoops ?? 10));

        if (
          lessonSlug &&
          sessionId &&
          totalTakesNow >= maxTakes &&
          !sessionSubmittedRef.current
        ) {
          sessionSubmittedRef.current = true;

          const allScores = [...sessionScores, score];
          const aggScore = aggregateForSubmission(allScores);

          const snapshots = {
            perTakeFinals: allScores.map((s, i) => ({ i, final: s.final.percent })),
            perTakePitch: allScores.map((s, i) => ({ i, pct: s.pitch.percent })),
          };

          void fetch(`/api/lessons/${lessonSlug}/results`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({
              sessionId,
              takeIndex: totalTakesNow - 1,
              score: aggScore,
              snapshots,
            }),
          }).catch(() => {});
        }

        // Side panel snapshot history (for review UI)
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
    alignForScoring,
    sampler,
    hand,
    rhythmEffective,
    scoreTake,
    sessionScores, // include full array to satisfy exhaustive-deps
    lessonSlug,
    sessionId,
    exerciseLoops,
    takeSnapshots,
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

  // ----- footer actions (available AFTER pretest) -----
  const footerTonicMidi = useMemo<number | null>(() => {
    if (lowHz == null) return null;
    const lowM = Math.round(hzToMidi(lowHz));
    const pc = sessionEff.scale?.tonicPc ?? 0;
    const wantPc = ((pc % 12) + 12) % 12;
    for (let m = lowM; m < lowM + 36; m++) {
      if ((((m % 12) + 12) % 12) === wantPc) return m;
    }
    return null;
  }, [lowHz, sessionEff.scale?.tonicPc]);

  const footerTonicLabel = useMemo(() => {
    if (footerTonicMidi == null) return "—";
    const n = midiToNoteName(footerTonicMidi, { useSharps: true });
    return `${n.name}${n.octave}`;
  }, [footerTonicMidi]);

  const { third: triadThird, fifth: triadFifth } = triadOffsetsForScale(sessionEff.scale?.name ?? "major");
  const footerArpMidis = useMemo<number[] | null>(() => {
    if (footerTonicMidi == null) return null;
    const r = footerTonicMidi;
    return [r, r + triadThird, r + triadFifth, r + triadThird, r];
  }, [footerTonicMidi, triadThird, triadFifth]);

  // Arp button label: show ONLY the first solfège (mode-aware for ANY scale)
  const footerArpLabel = useMemo(() => {
    const scaleName = (sessionEff.scale?.name ?? "major") as SolfegeScaleName;
    const tonicPc = sessionEff.scale?.tonicPc ?? 0;
    return pcToSolfege(tonicPc, tonicPc, scaleName);
  }, [sessionEff.scale?.name, sessionEff.scale?.tonicPc]);

  const playFooterTonic = useCallback(async () => {
    if (footerTonicMidi == null) return;
    try { await playMidiList([footerTonicMidi], Math.max(0.25, Math.min(1.0, secondsPerBeat(bpm, ts.den)))); } catch {}
  }, [footerTonicMidi, playMidiList, bpm, ts.den]);

  const playFooterArp = useCallback(async () => {
    if (!footerArpMidis) return;
    try { await playMidiList(footerArpMidis, Math.max(0.2, Math.min(0.75, secondsPerBeat(bpm, ts.den)))); } catch {}
  }, [footerArpMidis, playMidiList, bpm, ts.den]);

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

  const footerTonicAction = exerciseUnlocked
    ? { label: footerTonicLabel, onClick: playFooterTonic, disabled: footerTonicMidi == null, title: "Play tonic" }
    : undefined;

  const footerArpAction = exerciseUnlocked
    ? { label: footerArpLabel, onClick: playFooterArp, disabled: !footerArpMidis, title: "Play arpeggio" }
    : undefined;

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
      tonicPc={exerciseUnlocked ? (sessionEff.scale?.tonicPc ?? null) : null}
      scaleName={sessionEff.scale?.name ?? null}
      tonicAction={footerTonicAction}
      arpAction={footerArpAction}
    />
  );
}
