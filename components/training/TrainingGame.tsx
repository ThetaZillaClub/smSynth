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
  noteValueToSeconds,
} from "@/utils/time/tempo";
import { effectiveBpm } from "@/utils/time/speed";
import { hzToMidi } from "@/utils/pitch/pitchMath"; // ← NEW
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

/* ---------------- Gameplay Settings (from Settings panel) ---------------- */
const SPEED_KEY = "gameplay:speedPercent";
const KEY_CHOICE_KEY = "gameplay:keyChoice";       // "random" | "0..11"
const OCTAVE_PREF_KEY = "gameplay:octavePref";     // "low" | "high"
const LEAD_KEY = "gameplay:leadBars";              // "1" | "2"
const AUTOPLAY_KEY = "gameplay:autoplay";          // "on" | "off"

type KeyChoice = "random" | number;
type OctPref = "low" | "high";

function readSpeedPercent(): number {
  try {
    const raw = typeof window !== "undefined" ? window.localStorage.getItem(SPEED_KEY) : null;
    const n = raw == null ? NaN : Number(raw);
    const clamped = Math.max(75, Math.min(150, Math.round(Number.isFinite(n) ? n : 75)));
    return clamped;
  } catch {
    return 75;
  }
}

function readKeyChoice(): KeyChoice {
  try {
    const raw = localStorage.getItem(KEY_CHOICE_KEY);
    if (raw == null || raw === "random") return "random";
    const n = Number(raw);
    return Number.isFinite(n) && n >= 0 && n <= 11 ? (n as number) : "random";
  } catch {
    return "random";
  }
}

function readOctPref(): OctPref {
  try {
    const raw = localStorage.getItem(OCTAVE_PREF_KEY);
    return raw === "high" ? "high" : "low";
  } catch {
    return "low";
  }
}

function readLeadBars(): 1 | 2 {
  try {
    const raw = localStorage.getItem(LEAD_KEY);
    const n = raw == null ? 1 : Math.round(Number(raw));
    return n === 2 ? 2 : 1;
  } catch {
    return 1;
  }
}

function readAutoplay(): boolean {
  try {
    const raw = localStorage.getItem(AUTOPLAY_KEY);
    return raw === "off" ? false : true; // default ON
  } catch {
    return true;
  }
}
/* ------------------------------------------------------------------------ */

type TakeSnapshot = {
  phrase: Phrase;
  rhythm: RhythmEvent[] | null;
  melodyRhythm: RhythmEvent[] | null;
};

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

  /* ----- Live gameplay settings state (reacts to Settings panel) ----- */
  const [speedPercent, setSpeedPercent] = useState<number>(readSpeedPercent());
  const [keyChoice, setKeyChoice] = useState<KeyChoice>(readKeyChoice());
  const [octPref, setOctPref] = useState<OctPref>(readOctPref());
  const [leadBarsSetting, setLeadBarsSetting] = useState<1 | 2>(readLeadBars());
  const [autoplay, setAutoplay] = useState<boolean>(readAutoplay());

  // Re-select a random key only when the allowed set or "random" state toggles
  const randomPcRef = useRef<number | null>(null);
  useEffect(() => {
    // Keep speed + other settings in sync with cross-tab updates
    const onStorage = (e: StorageEvent) => {
      if (e.key === SPEED_KEY) setSpeedPercent(readSpeedPercent());
      if (e.key === KEY_CHOICE_KEY) {
        setKeyChoice(readKeyChoice());
        randomPcRef.current = null; // force a new pick next time if "random"
      }
      if (e.key === OCTAVE_PREF_KEY) setOctPref(readOctPref());
      if (e.key === LEAD_KEY) setLeadBarsSetting(readLeadBars());
      if (e.key === AUTOPLAY_KEY) setAutoplay(readAutoplay());
    };
    window.addEventListener("storage", onStorage);
    // one-time refresh on mount
    setSpeedPercent(readSpeedPercent());
    setKeyChoice(readKeyChoice());
    setOctPref(readOctPref());
    setLeadBarsSetting(readLeadBars());
    setAutoplay(readAutoplay());
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  // Effective BPM (speed slider)
  const baselineBpm = sessionConfig?.bpm ?? DEFAULT_SESSION_CONFIG.bpm;
  const bpmEff = useMemo(() => effectiveBpm(baselineBpm, speedPercent), [baselineBpm, speedPercent]);

  // Allowed tonic PCs from saved range (tonic → tonic+octave must fit)
  const allowedTonicPcs = useMemo<Set<number>>(() => {
    if (lowHz == null || highHz == null) return new Set();
    const loM = Math.round(hzToMidi(Math.min(lowHz, highHz)));
    const hiM = Math.round(hzToMidi(Math.max(lowHz, highHz)));
    const maxTonic = hiM - 12;
    if (maxTonic < loM) return new Set();
    const set = new Set<number>();
    for (let m = loM; m <= maxTonic; m++) set.add(((m % 12) + 12) % 12);
    return set;
  }, [lowHz, highHz]);

  // Resolve tonicPc from settings (specific or random in-range, chosen once per change)
  const resolvedTonicPc = useMemo<number>(() => {
    if (typeof keyChoice === "number") return ((keyChoice % 12) + 12) % 12;
    // random
    if (!allowedTonicPcs.size) return (sessionConfig.scale?.tonicPc ?? 0) % 12;
    if (randomPcRef.current != null) return randomPcRef.current;
    const pcs = Array.from(allowedTonicPcs);
    const pick = pcs[Math.floor(Math.random() * pcs.length)];
    randomPcRef.current = pick;
    return pick;
  }, [keyChoice, allowedTonicPcs, sessionConfig.scale?.tonicPc]);

  // Build tonic windows (absolute midi tonics) for the resolved key & range, select low/high
  const tonicMidisFromPref = useMemo<number[] | null>(() => {
    if (lowHz == null || highHz == null) return null;
    const loM = Math.round(hzToMidi(Math.min(lowHz, highHz)));
    const hiM = Math.round(hzToMidi(Math.max(lowHz, highHz)));
    const windows: number[] = [];
    for (let m = loM; m <= hiM - 12; m++) {
      if ((((m % 12) + 12) % 12) === resolvedTonicPc) windows.push(m);
    }
    if (!windows.length) return null;
    const idx = octPref === "high" ? windows.length - 1 : 0;
    return [windows[idx]];
  }, [lowHz, highHz, resolvedTonicPc, octPref]);

  // Compose a session that *includes* all overrides from the Gameplay panel
  const sessionEff = useMemo<SessionConfig>(() => {
    const base: SessionConfig = { ...sessionConfig, bpm: bpmEff };

    // Lead-in bars & autoplay (looping)
    base.leadBars = leadBarsSetting;
    base.loopingMode = !!autoplay;

    // Key override: pin a tonicPc (even if course config had random) and prefer a window
    const prevScale = base.scale ?? { tonicPc: 0, name: "major" as const };
    base.scale = { ...prevScale, tonicPc: resolvedTonicPc, randomTonic: false };

    // Use tonic window preference if available
    base.tonicMidis = tonicMidisFromPref ?? null;

    return base;
  }, [sessionConfig, bpmEff, leadBarsSetting, autoplay, resolvedTonicPc, tonicMidisFromPref]);

  /* ---------------- rest of original TrainingGame (unchanged) ---------------- */
  const step: "play" = "play";
  const {
    bpm, // effective
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
  } = sessionEff;

  const secPerBeat = secondsPerBeat(bpm, ts.den);
  const leadBeats = barsToBeats(leadBars, ts.num);
  const leadInSec = beatsToSeconds(leadBeats, bpm, ts.den);
  const restBeats = barsToBeats(restBars, ts.num);
  const restSec = beatsToSeconds(restBeats, bpm, ts.den);

  const MAX_TAKES = Math.max(1, Number(exerciseLoops ?? 10));
  const MAX_SESSION_SEC = 15 * 60;

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
    sessionConfig: sessionEff, // uses effective session w/ overrides
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
      playA440: async (durSec) => {
        await playA440(durSec);
      },
      playMidiList: async (midi, noteDurSec) => {
        await playMidiList(midi, noteDurSec);
      },
    },
  });

  const pretestRequired = (callResponseSequence?.length ?? 0) > 0;
  const pretestActive = pretestRequired && pretest.status !== "done";
  const exerciseUnlocked = !pretestRequired || pretest.status === "done";

  const rhythmCfgAny = (sessionEff.rhythm ?? {}) as any;
  const rhythmLineEnabled = rhythmCfgAny.lineEnabled !== false;
  const rhythmDetectEnabled = rhythmCfgAny.detectEnabled !== false;
  const needVision = exerciseUnlocked && rhythmLineEnabled && rhythmDetectEnabled;

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
    onAdvancePhrase: () => {
      if (regenerateBetweenTakes && loopingMode) setSeedBump((n) => n + 1);
    },
    onEnterPlay: () => {},
    autoContinue: !!loopingMode,
    onRestComplete: () => {
      if (!loopingMode && regenerateBetweenTakes) setSeedBump((n) => n + 1);
      if (!loopingMode) setReviewVisible(true);
    },
  });

  const startPretestSafe = async () => {
    loop.clearAll();
    stopPlayback();
    await stopRec().catch(() => {});
    pretest.start();
  };

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
    metronome,
    leadBeats,
    loopPhase: loop.loopPhase,
    anchorMs: loop.anchorMs,
    playLeadInTicks,
    secPerBeat,
  });

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

  const samplerActive: boolean = !pretestActive && loop.loopPhase === "record";
  const samplerAnchor: number | null = !pretestActive ? loop.anchorMs ?? null : null;
  const sampler = usePitchSampler({ active: samplerActive, anchorMs: samplerAnchor, hz: liveHz, confidence, fps: 60 });

  useEffect(() => {
    (async () => {
      try { await warmPlayer(); } catch {}
      try { await warmRecorder(); } catch {}
    })();
  }, [warmPlayer, warmRecorder]);

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
        const gestureLagSec = 0;

        void scoreTake({
          phrase: usedPhrase,
          bpm,
          den: ts.den,
          leadInSec,
          pitchLagSec,
          gestureLagSec,
          snapshotSamples: () => sampler.snapshot(),
          snapshotBeats: () => hand.snapshotEvents(),
          melodyOnsetsSec: usedPhrase.notes.map((n) => n.startSec),
          rhythmOnsetsSec: makeOnsetsFromRhythm(usedRhythm),
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

  const onNextPhrase = () => {
    setSeedBump((n) => n + 1);
    setReviewVisible(false);
  };

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
    if (!exerciseUnlocked) return;
    setReviewVisible(false);
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
      start: startPretestSafe,
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
    haveRhythm: haveRhythm,
    player: {
      playPhrase,
      playRhythm,
      playMelodyAndRhythm,
      stop: stopPlayback,
    },
    bpm,
    den: ts.den,
    tsNum: ts.num,
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
      lyrics={showLyrics ? fabric.words ?? undefined : undefined}
      livePitchHz={liveHz}
      confidence={confidence}
      confThreshold={CONF_THRESHOLD}
      startAtMs={startAtMs}
      leadInSec={leadInSec}
      isReady={isReady && (!!phrase || pretestActive)}
      step={step}
      loopPhase={pretestActive ? "call" : loop.loopPhase}
      rhythm={(rhythmEffective ?? undefined) as any}
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
    />
  );
}
