// app/training/page.tsx
"use client";

import React, { useMemo, useState, useEffect, useRef, useCallback } from "react";
import GameLayout from "@/components/game-layout/GameLayout";
import RangeCapture from "@/components/game-layout/range/RangeCapture";
import TrainingSessionPanel from "@/components/game-layout/TrainingSessionPanel";
import ExportModal from "@/components/game-layout/ExportModal";

import usePitchDetection from "@/hooks/usePitchDetection";
import useWavRecorder from "@/hooks/useWavRecorder";
import useFixedFpsTrace from "@/hooks/useFixedFpsTrace";
import useSessionPackager from "@/hooks/training/useSessionPackager";
import useUiRecordTimer from "@/hooks/training/useUiRecordTimer";
import usePhraseLyrics from "@/hooks/training/usePhraseLyrics";

import { hzToNoteName } from "@/utils/pitch/pitchMath";
import { APP_BUILD, CONF_THRESHOLD } from "@/utils/training/constants";

// timing (kept local; move to constants if you prefer)
const RECORD_SEC = 8;
const REST_SEC = 8;
const TRAIN_LEAD_IN_SEC = 1.0;
const NOTE_DUR_SEC = 0.5;
const MAX_TAKES = 24;
const MAX_SESSION_SEC = 15 * 60;

export default function Training() {
  const [step, setStep] = useState<"low" | "high" | "play">("low");
  const [lowHz, setLowHz] = useState<number | null>(null);
  const [highHz, setHighHz] = useState<number | null>(null);

  const { pitch, confidence, isReady, error } = usePitchDetection("/models/swiftf0", {
    enabled: true, fps: 50, minDb: -45, smoothing: 2, centsTolerance: 3,
  });

  // phrase + lyrics with seeded control
  const { phrase, words, reset: resetPhraseLyrics, advance: advancePhraseLyrics, getLyricSeed } =
    usePhraseLyrics({ lowHz, highHz, lyricStrategy: "mixed", noteDurSec: NOTE_DUR_SEC });

  // recorder + traces
  const {
    isRecording, start: startRec, stop: stopRec, wavBlob, durationSec, startedAtMs,
    sampleRateOut, deviceSampleRateHz, workletBufferSize, baseLatencySec,
    metrics, numSamplesOut, pcm16k, resampleMethod,
  } = useWavRecorder({ sampleRateOut: 16000 });

  const { hzArr, confArr, rmsDbArr, setLatest, reset: resetFixed } = useFixedFpsTrace(isRecording, 50);
  useEffect(() => { setLatest(typeof pitch === "number" ? pitch : null, confidence ?? 0); },
    [pitch, confidence, setLatest]);

  // session packager (pins phrase/words per take, aggregates PCM, builds export)
  const sessionIdRef = useRef<string>(crypto.randomUUID());
  const {
    packagedCount, inFlight,
    beginTake, completeTakeFromBlob, resetSession, finalizeSession,
    showExport, setShowExport, sessionWavUrl, sessionJsonUrl,
  } = useSessionPackager({ appBuild: APP_BUILD, sessionId: sessionIdRef.current });

  // loop flags
  const [running, setRunning] = useState(false);
  const [looping, setLooping] = useState(false);
  const [loopPhase, setLoopPhase] = useState<"idle" | "record" | "rest">("idle");
  const [activeWord, setActiveWord] = useState<number>(-1);

  // anchors & timers
  const playEpochMsRef = useRef<number | null>(null);
  const recordTimerRef = useRef<number | null>(null);
  const restTimerRef = useRef<number | null>(null);
  const clearTimers = useCallback(() => {
    if (recordTimerRef.current != null) { clearTimeout(recordTimerRef.current); recordTimerRef.current = null; }
    if (restTimerRef.current != null) { clearTimeout(restTimerRef.current); restTimerRef.current = null; }
  }, []);

  // guard time window
  const sessionStartMsRef = useRef<number | null>(null);

  // nice wall-clock seconds tied to play anchor
  const uiRecordSec = useUiRecordTimer(isRecording, playEpochMsRef.current);

  // mic/pitch text
  const micText = error ? `Mic error: ${String(error)}` : isReady ? "Mic ready" : "Starting mic…";
  const pitchText = typeof pitch === "number" ? `${pitch.toFixed(1)} Hz` : "—";
  const noteText =
    typeof pitch === "number"
      ? (() => {
          const { name, octave, cents } = hzToNoteName(pitch, 440, { useSharps: true, octaveAnchor: "A" });
          const sign = cents > 0 ? "+" : "";
          return `${name}${octave} ${sign}${cents}¢`;
        })()
      : "—";

  // on enter play: reset session + phrase/lyrics
  useEffect(() => {
    if (step === "play" && lowHz != null && highHz != null) {
      resetSession();
      resetPhraseLyrics();
      sessionStartMsRef.current = performance.now();
      playEpochMsRef.current = null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, lowHz, highHz]);

  // start/stop recorder when running flips
  const recLockRef = useRef({ starting: false, stopping: false });
  useEffect(() => {
    (async () => {
      if (step === "play" && running && !isRecording && !recLockRef.current.starting) {
        recLockRef.current.starting = true;
        resetFixed();
        await startRec();
        recLockRef.current.starting = false;
        return;
      }
      if (isRecording && !running && !recLockRef.current.stopping) {
        recLockRef.current.stopping = true;
        await stopRec();
        recLockRef.current.stopping = false;
      }
    })();
  }, [step, running, isRecording, startRec, stopRec, resetFixed]);

  // REST countdown → next take
  useEffect(() => {
    if (loopPhase !== "rest" || !looping) {
      if (restTimerRef.current != null) { clearTimeout(restTimerRef.current); restTimerRef.current = null; }
      return;
    }
    if (!isRecording && restTimerRef.current == null) {
      restTimerRef.current = window.setTimeout(() => {
        restTimerRef.current = null;
        startRecordPhase();
      }, REST_SEC * 1000);
    }
  }, [loopPhase, looping, isRecording]); // startRecordPhase is stable

  // TS-safe view over PCM (16k mono)
  const pcmView: Float32Array | null = useMemo(() => {
    if (!pcm16k) return null;
    try {
      const buf = (pcm16k as any).buffer as ArrayBuffer;
      const offset = (pcm16k as any).byteOffset ?? 0;
      const length = (pcm16k as any).length ?? 0;
      return new Float32Array(buf, offset * 4, length);
    } catch {
      return (pcm16k as unknown) as Float32Array;
    }
  }, [pcm16k]);

  // start one take
  const startRecordPhase = useCallback(() => {
    if (lowHz == null || highHz == null || !phrase || !words) return;

    // guard by session limits
    const elapsed = sessionStartMsRef.current ? (performance.now() - sessionStartMsRef.current) / 1000 : 0;
    if (packagedCount + inFlight >= MAX_TAKES || elapsed >= MAX_SESSION_SEC) {
      setLooping(false); setRunning(false); setLoopPhase("idle");
      playEpochMsRef.current = null;
      clearTimers();
      finalizeSession(sampleRateOut || 16000);
      return;
    }

    // pin current UI for THIS take & mark inflight
    beginTake(phrase, words);

    // anchor overlay to wall-clock
    playEpochMsRef.current = performance.now();

    setLoopPhase("record");
    setRunning(true);

    // close record window
    if (recordTimerRef.current != null) clearTimeout(recordTimerRef.current);
    recordTimerRef.current = window.setTimeout(() => {
      setRunning(false);
      setActiveWord(-1);
      setLoopPhase("rest");
      // prepare NEXT set for REST display
      advancePhraseLyrics();
    }, RECORD_SEC * 1000);
  }, [
    lowHz, highHz, phrase, words,
    packagedCount, inFlight, clearTimers, finalizeSession,
    beginTake, advancePhraseLyrics, sampleRateOut
  ]);

  // stop loop fully
  const stopLoop = useCallback(() => {
    setLooping(false);
    clearTimers();
    setRunning(false);
    setLoopPhase("idle");
    playEpochMsRef.current = null;
    finalizeSession(sampleRateOut || 16000);
  }, [clearTimers, finalizeSession, sampleRateOut]);

  // play/pause button
  const handleToggle = useCallback(() => {
    if (step !== "play" || lowHz == null || highHz == null) return;
    if (!looping) {
      setLooping(true);
      clearTimers();
      startRecordPhase();
    } else {
      stopLoop();
    }
  }, [looping, step, lowHz, highHz, clearTimers, startRecordPhase, stopLoop]);

  // if phrase disappears, stop loop
  useEffect(() => {
    if (step !== "play" || lowHz == null || highHz == null) {
      if (looping) stopLoop();
    }
  }, [step, lowHz, highHz, looping, stopLoop]);

  // package ONE take per wavBlob (using pinned phrase/words inside the hook)
  useEffect(() => {
    if (!wavBlob) return;
    completeTakeFromBlob(wavBlob, {
      traces: { hzArr, confArr, rmsDbArr, fps: 50 },
      audio: {
        sampleRateOut,
        numSamplesOut: numSamplesOut ?? null,
        durationSec,
        deviceSampleRateHz: deviceSampleRateHz ?? 48000,
        baseLatencySec: baseLatencySec ?? null,
        workletBufferSize: workletBufferSize ?? null,
        resampleMethod,
        pcmView,
        metrics: metrics ?? null,
      },
      prompt: {
        a4Hz: 440,
        lowHz: lowHz ?? null,
        highHz: highHz ?? null,
        leadInSec: TRAIN_LEAD_IN_SEC,
        bpm: 120,
        lyricStrategy: "mixed",
        lyricSeed: getLyricSeed(),
        scale: "major",
      },
      timing: { playStartMs: playEpochMsRef.current ?? null, recStartMs: startedAtMs ?? null },
      controls: { genderLabel: null },
    });

    // cap guard: stop immediately if we hit max by packaging
    if (packagedCount + 1 >= MAX_TAKES) {
      setLooping(false);
      setRunning(false);
      setLoopPhase("idle");
      playEpochMsRef.current = null;
      clearTimers();
      finalizeSession(sampleRateOut || 16000);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wavBlob]); // internals captured via refs/state in the hook

  // cleanup timers on unmount
  useEffect(() => stopLoop, [stopLoop]);

  const statusText =
    loopPhase === "record" ? (isRecording ? "Recording…" : "Playing…") : loopPhase === "rest" && looping ? "Breather…" : "Idle";

  return (
    <>
      <GameLayout
        title="Training"
        micText={micText}
        error={error}
        running={running}
        uiRunning={looping}
        onToggle={handleToggle}
        phrase={phrase ?? undefined}
        lyrics={step === "play" && words ? words : undefined}
        activeLyricIndex={step === "play" ? activeWord : -1}
        onActiveNoteChange={(idx) => setActiveWord(idx)}
        pitchText={pitchText}
        noteText={noteText}
        confidence={confidence}
        livePitchHz={typeof pitch === "number" ? pitch : null}
        confThreshold={CONF_THRESHOLD}
        startAtMs={playEpochMsRef.current}
        leadInSec={TRAIN_LEAD_IN_SEC}
      >
        {step === "low" && (
          <RangeCapture
            mode="low"
            active
            pitchHz={typeof pitch === "number" ? pitch : null}
            confidence={confidence}
            confThreshold={CONF_THRESHOLD}
            bpm={60}
            beatsRequired={1}
            centsWindow={75}
            a4Hz={440}
            onConfirm={(hz) => { setLowHz(hz); setStep("high"); }}
          />
        )}

        {step === "high" && (
          <RangeCapture
            mode="high"
            active
            pitchHz={typeof pitch === "number" ? pitch : null}
            confidence={confidence}
            confThreshold={CONF_THRESHOLD}
            bpm={60}
            beatsRequired={1}
            centsWindow={75}
            a4Hz={440}
            onConfirm={(hz) => { setHighHz(hz); setStep("play"); }}
          />
        )}

        {step === "play" && (
          <TrainingSessionPanel
            statusText={statusText}
            isRecording={isRecording}
            uiRecordSec={Math.min(uiRecordSec, RECORD_SEC)}
            recordSec={RECORD_SEC}
            restSec={REST_SEC}
            maxTakes={MAX_TAKES}
            maxSessionSec={MAX_SESSION_SEC}
          />
        )}
      </GameLayout>

      <ExportModal
        open={showExport}
        wavUrl={sessionWavUrl ?? undefined}
        jsonUrl={sessionJsonUrl ?? undefined}
        onClose={() => setShowExport(false)}
      />
    </>
  );
}
