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

// timing
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

  // phrase + lyrics
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

  // session packager
  const sessionIdRef = useRef<string>(crypto.randomUUID());
  const {
    packagedCount, inFlight,
    beginTake, completeTakeFromBlob, resetSession, finalizeSession,
    showExport, setShowExport, sessionWavUrl, sessionJsonUrl,
  } = useSessionPackager({ appBuild: APP_BUILD, sessionId: sessionIdRef.current });

  // keep latest counts in a ref to avoid stale-closure in timers
  const countsRef = useRef({ packagedCount: 0, inFlight: 0 });
  useEffect(() => {
    countsRef.current.packagedCount = packagedCount;
    countsRef.current.inFlight = inFlight;
  }, [packagedCount, inFlight]);

  // loop flags
  const [running, setRunning] = useState(false);
  const [looping, setLooping] = useState(false);
  const [loopPhase, setLoopPhase] = useState<"idle" | "record" | "rest">("idle");
  const [activeWord, setActiveWord] = useState<number>(-1);

  // timers/guards
  const recordTimerRef = useRef<number | null>(null);
  const restTimerRef = useRef<number | null>(null);
  const clearTimers = useCallback(() => {
    if (recordTimerRef.current != null) { clearTimeout(recordTimerRef.current); recordTimerRef.current = null; }
    if (restTimerRef.current != null) { clearTimeout(restTimerRef.current); restTimerRef.current = null; }
  }, []);

  // guard time window
  const sessionStartMsRef = useRef<number | null>(null);

  // nice wall-clock seconds tied to RECORDER start (recStartMs)
  const uiRecordSec = useUiRecordTimer(isRecording, startedAtMs ?? null);

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

  // --- keep this above the REST effect to avoid TS2448/2454 ---
  // start one take (reads latest counts from ref to avoid stale closures)
  const startRecordPhase = useCallback(() => {
    if (lowHz == null || highHz == null || !phrase || !words) return;

    const nowCounts = countsRef.current;
    const elapsed = sessionStartMsRef.current ? (performance.now() - sessionStartMsRef.current) / 1000 : 0;

    // guard by session limits using LATEST counts
    if (nowCounts.packagedCount + nowCounts.inFlight >= MAX_TAKES || elapsed >= MAX_SESSION_SEC) {
      setLooping(false); setRunning(false); setLoopPhase("idle");
      clearTimers();
      finalizeSession(sampleRateOut || 16000);
      return;
    }

    // pin current UI for THIS take & mark inflight
    beginTake(phrase, words);

    // enter record phase; recorder will start shortly; we stop exactly after recStartMs + RECORD_SEC
    setLoopPhase("record");
    setRunning(true);
  }, [
    lowHz, highHz, phrase, words,
    clearTimers, finalizeSession, beginTake, sampleRateOut
  ]);
  // --- /keep ---

  // EXACT end of record window: stop at startedAtMs + RECORD_SEC
  useEffect(() => {
    if (loopPhase !== "record") {
      if (recordTimerRef.current != null) { clearTimeout(recordTimerRef.current); recordTimerRef.current = null; }
      return;
    }
    if (isRecording && startedAtMs != null && recordTimerRef.current == null) {
      const now = performance.now();
      const delayMs = Math.max(0, RECORD_SEC * 1000 - (now - startedAtMs));
      recordTimerRef.current = window.setTimeout(() => {
        if (!recLockRef.current.stopping) {
          recLockRef.current.stopping = true;
          void stopRec().finally(() => { recLockRef.current.stopping = false; });
        }
        setRunning(false);
        setActiveWord(-1);
        setLoopPhase("rest");
        advancePhraseLyrics(); // prep next while we rest
      }, delayMs);
    }
  }, [loopPhase, isRecording, startedAtMs, advancePhraseLyrics, stopRec]);

  // REST countdown → next take (with cap checks using LATEST counts at fire time)
  useEffect(() => {
    if (loopPhase !== "rest" || !looping) {
      if (restTimerRef.current != null) { clearTimeout(restTimerRef.current); restTimerRef.current = null; }
      return;
    }
    if (!isRecording && restTimerRef.current == null) {
      // check before scheduling
      const pre = countsRef.current;
      if (pre.packagedCount + pre.inFlight >= MAX_TAKES) return;

      restTimerRef.current = window.setTimeout(() => {
        restTimerRef.current = null;

        // re-check USING LATEST VALUES (fixes ghost take)
        const cur = countsRef.current;
        if (cur.packagedCount + cur.inFlight >= MAX_TAKES) {
          setLooping(false);
          setRunning(false);
          setLoopPhase("idle");
          clearTimers();
          finalizeSession(sampleRateOut || 16000);
        } else {
          startRecordPhase();
        }
      }, REST_SEC * 1000);
    }
  }, [loopPhase, looping, isRecording, clearTimers, finalizeSession, sampleRateOut, startRecordPhase]);

  // central cap guard: when packagedCount hits MAX_TAKES, stop & finalize immediately
  useEffect(() => {
    if (packagedCount >= MAX_TAKES) {
      setLooping(false);
      setRunning(false);
      setLoopPhase("idle");
      clearTimers();
      finalizeSession(sampleRateOut || 16000);
    }
  }, [packagedCount, clearTimers, finalizeSession, sampleRateOut]);

  // play/pause button
  const handleToggle = useCallback(() => {
    if (step !== "play" || lowHz == null || highHz == null) return;
    if (!looping) {
      setLooping(true);
      clearTimers();
      startRecordPhase();
    } else {
      setLooping(false);
      clearTimers();
      setRunning(false);
      setLoopPhase("idle");
      finalizeSession(sampleRateOut || 16000);
    }
  }, [looping, step, lowHz, highHz, clearTimers, startRecordPhase, finalizeSession, sampleRateOut]);

  // if phrase disappears, stop loop
  useEffect(() => {
    if (step !== "play" || lowHz == null || highHz == null) {
      if (looping) {
        setLooping(false);
        clearTimers();
        setRunning(false);
        setLoopPhase("idle");
        finalizeSession(sampleRateOut || 16000);
      }
    }
  }, [step, lowHz, highHz, looping, clearTimers, finalizeSession, sampleRateOut]);

  // package ONE take per wavBlob (using pinned phrase/words inside the hook)
  useEffect(() => {
    if (!wavBlob) return;

    // Enforce EXACT take length of 8s @ 16k: 8 * 16000 = 128,000 samples
    const sr = sampleRateOut || 16000;
    const wantSamples = Math.max(0, Math.round(RECORD_SEC * sr)); // 128,000 for 8s
    const srcLen = pcmView?.length ?? 0;

    let outPcm: Float32Array | null = null;
    let outLen = srcLen;
    let outDur = durationSec;

    if (pcmView && srcLen > 0) {
      if (srcLen > wantSamples) {
        // Trim any extra samples (safety against buffer overrun)
        outPcm = pcmView.slice(0, wantSamples);
        outLen = wantSamples;
        outDur = wantSamples / sr;
      } else if (srcLen < wantSamples) {
        // Zero-pad the tail to hit the exact window length
        const pad = new Float32Array(wantSamples);
        pad.set(pcmView, 0);
        outPcm = pad;
        outLen = wantSamples;
        outDur = wantSamples / sr;
      } else {
        // Already exact length
        outPcm = pcmView;
        outLen = srcLen;
        outDur = srcLen / sr;
      }
    } else {
      // No PCM view; fall back to whatever the recorder reported
      outPcm = pcmView || null;
      outLen = srcLen;
      outDur = srcLen > 0 ? srcLen / sr : durationSec;
    }

    completeTakeFromBlob(wavBlob, {
      traces: { hzArr, confArr, rmsDbArr, fps: 50 },
      audio: {
        sampleRateOut: sr,
        numSamplesOut: outLen || (numSamplesOut ?? null),
        durationSec: outDur,
        deviceSampleRateHz: deviceSampleRateHz ?? 48000,
        baseLatencySec: baseLatencySec ?? null,
        workletBufferSize: workletBufferSize ?? null,
        resampleMethod,
        pcmView: outPcm,
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
      timing: { playStartMs: startedAtMs ?? null, recStartMs: startedAtMs ?? null },
      controls: { genderLabel: null },
    });

    // rely on packagedCount watcher to finalize at cap
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wavBlob]); // internals captured via refs/state in the hook

  // cleanup timers on unmount
  useEffect(() => () => { clearTimers(); }, [clearTimers]);

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
        startAtMs={isRecording ? (startedAtMs ?? null) : null}
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
