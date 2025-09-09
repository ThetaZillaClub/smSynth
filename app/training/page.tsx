// app/training/page.tsx
"use client";

import React, { useMemo, useState, useEffect, useRef, useCallback } from "react";
import GameLayout from "@/components/game-layout/GameLayout";
import RangeCapture from "@/components/game-layout/range/RangeCapture";
import usePitchDetection from "@/hooks/usePitchDetection";
import useWavRecorder from "@/hooks/useWavRecorder";
import type { Phrase } from "@/components/piano-roll/types";
import { hzToNoteName } from "@/utils/pitch/pitchMath";
import { makeWordLyricVariant } from "@/utils/lyrics/wordBank";
import { buildPhraseFromRangeDiatonicVariant } from "@/utils/phrase/diatonic";
import { buildTakeV2 } from "@/utils/take/buildTakeV2";
import { buildSessionV2 } from "@/utils/take/buildSessionV2";
import { APP_BUILD, CONF_THRESHOLD } from "@/utils/training/constants";
import useFixedFpsTrace from "@/hooks/useFixedFpsTrace";
import { encodeWavPCM16, concatFloat32 } from "@/utils/audio/wav";

/** --- Loop timing --- */
const RECORD_SEC = 8;
const REST_SEC = 8;
const TRAIN_LEAD_IN_SEC = 1.0;
/** 8 notes * 0.5s = 4s notes inside the 8s window */
const NOTE_DUR_SEC = 0.5;

/** Session limits — stop before we run forever */
const MAX_TAKES = 24;
const MAX_SESSION_SEC = 15 * 60;

export default function Training() {
  const [step, setStep] = useState<"low" | "high" | "play">("low");
  const [lowHz, setLowHz] = useState<number | null>(null);
  const [highHz, setHighHz] = useState<number | null>(null);

  const { pitch, confidence, isReady, error } = usePitchDetection("/models/swiftf0", {
    enabled: true,
    fps: 50,
    minDb: -45,
    smoothing: 2,
    centsTolerance: 3,
  });

  /** take-level flags */
  const [running, setRunning] = useState(false);
  const [looping, setLooping] = useState(false);
  const [loopPhase, setLoopPhase] = useState<"idle" | "record" | "rest">("idle");

  const [activeWord, setActiveWord] = useState<number>(-1);
  const [lyricStrategy] = useState<"mixed" | "stableVowel">("mixed");

  /** Session bookkeeping */
  const sessionStartMsRef = useRef<number | null>(null);
  // How many takes have been *packaged* this session
  const packagedCountRef = useRef<number>(0);
  // How many takes are *started but not yet packaged*
  const inFlightRef = useRef<number>(0);

  /** Aggregation (PCM + takes) */
  const pcmChunksRef = useRef<Float32Array[]>([]);
  const sampleCountsRef = useRef<number[]>([]);
  const takesRef = useRef<any[]>([]);

  /** Final export URLs */
  const [sessionWavUrl, setSessionWavUrl] = useState<string | null>(null);
  const [sessionJsonUrl, setSessionJsonUrl] = useState<string | null>(null);
  const [showExport, setShowExport] = useState(false);

  /** Wall-clock record timer for UI (anchored to playEpochMsRef) */
  const [uiRecordSec, setUiRecordSec] = useState(0);

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

  /** UI phrase/lyrics (what we show on screen) */
  const [phrase, setPhrase] = useState<Phrase | null>(null);
  const [words, setWords] = useState<string[] | null>(null);

  /** “Pinned” phrase/lyrics for the take being recorded (used for packaging) */
  const takePhraseRef = useRef<Phrase | null>(null);
  const takeWordsRef = useRef<string[] | null>(null);

  /** Seeds */
  const phraseSeedRef = useRef<number>(crypto.getRandomValues(new Uint32Array(1))[0]! >>> 0);
  const lyricSeedRef = useRef<number>(crypto.getRandomValues(new Uint32Array(1))[0]! >>> 0);

  // initialize first UI phrase/lyrics when entering play
  useEffect(() => {
    if (step === "play" && lowHz != null && highHz != null) {
      const p = buildPhraseFromRangeDiatonicVariant(lowHz, highHz, 440, NOTE_DUR_SEC, phraseSeedRef.current);
      const w = makeWordLyricVariant(8, lyricStrategy, lyricSeedRef.current);
      setPhrase(p);
      setWords(w);

      // fresh session counters + buffers
      sessionStartMsRef.current = performance.now();
      packagedCountRef.current = 0;
      inFlightRef.current = 0;
      pcmChunksRef.current = [];
      sampleCountsRef.current = [];
      takesRef.current = [];
      setSessionWavUrl(null);
      setSessionJsonUrl(null);
      setShowExport(false);
      // reset de-dupe
      lastPackagedBlobRef.current = null;
      // clear any stale IDs
      takeIdRef.current = "";
    } else {
      setPhrase(null);
      setWords(null);
    }
  }, [step, lowHz, highHz, lyricStrategy]);

  // Recorder + traces
  const {
    isRecording,
    start: startRec,
    stop: stopRec,
    wavBlob,
    durationSec,
    startedAtMs,
    sampleRateOut,
    deviceSampleRateHz,
    workletBufferSize,
    baseLatencySec,
    metrics,
    numSamplesOut,
    pcm16k,
    resampleMethod,
  } = useWavRecorder({ sampleRateOut: 16000 });

  const { hzArr, confArr, rmsDbArr, setLatest, reset: resetFixed } = useFixedFpsTrace(isRecording, 50);
  useEffect(() => {
    setLatest(typeof pitch === "number" ? pitch : null, confidence ?? 0);
  }, [pitch, confidence, setLatest]);

  // Anchor UI start time
  const playEpochMsRef = useRef<number | null>(null);

  // Timers
  const recordTimerRef = useRef<number | null>(null);
  const restTimerRef = useRef<number | null>(null);
  const clearTimers = useCallback(() => {
    if (recordTimerRef.current != null) {
      clearTimeout(recordTimerRef.current);
      recordTimerRef.current = null;
    }
    if (restTimerRef.current != null) {
      clearTimeout(restTimerRef.current);
      restTimerRef.current = null;
    }
  }, []);

  // IDs
  const sessionIdRef = useRef<string>(crypto.randomUUID());
  const takeIdRef = useRef<string>("");
  const lastPackagedBlobRef = useRef<Blob | null>(null); // de-dupe per blob

  /** Start one take */
  const startRecordPhase = useCallback(() => {
    if (lowHz == null || highHz == null || !phrase || !words) return;

    // session guard — use packaged + in-flight
    const elapsed = sessionStartMsRef.current ? (performance.now() - sessionStartMsRef.current) / 1000 : 0;
    const startedOrPackaged = packagedCountRef.current + inFlightRef.current;
    if (startedOrPackaged >= MAX_TAKES || elapsed >= MAX_SESSION_SEC) {
      setLooping(false);
      setRunning(false);
      setLoopPhase("idle");
      playEpochMsRef.current = null;
      clearTimers();
      finalizeSession();
      return;
    }

    // new take id + pin phrase/words for THIS take
    takeIdRef.current = crypto.randomUUID();
    takePhraseRef.current = phrase;
    takeWordsRef.current = words;

    // mark one take in-flight
    inFlightRef.current += 1;

    // sync overlay start → now
    playEpochMsRef.current = performance.now();

    // run recorder
    setLoopPhase("record");
    setRunning(true);

    // end the record window
    if (recordTimerRef.current != null) clearTimeout(recordTimerRef.current);
    recordTimerRef.current = window.setTimeout(() => {
      setRunning(false);
      setActiveWord(-1);
      setLoopPhase("rest");

      // prepare NEXT phrase/lyrics immediately for REST display
      phraseSeedRef.current = (phraseSeedRef.current + 1) >>> 0;
      const nextPhrase = buildPhraseFromRangeDiatonicVariant(lowHz, highHz, 440, NOTE_DUR_SEC, phraseSeedRef.current);

      lyricSeedRef.current = (lyricSeedRef.current + 1) >>> 0;
      const nextWords = makeWordLyricVariant(nextPhrase.notes.length, lyricStrategy, lyricSeedRef.current);

      setPhrase(nextPhrase);
      setWords(nextWords);
    }, RECORD_SEC * 1000);
  }, [lowHz, highHz, phrase, words, lyricStrategy, clearTimers]);

  /** Stop loop fully */
  const stopLoop = useCallback(() => {
    setLooping(false);
    clearTimers();
    setRunning(false);
    setLoopPhase("idle");
    playEpochMsRef.current = null;
    finalizeSession();
  }, [clearTimers]);

  /** Header button */
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

  /** If phrase disappears, stop loop */
  useEffect(() => {
    if (step !== "play" || lowHz == null || highHz == null) {
      if (looping) stopLoop();
    }
  }, [step, lowHz, highHz, looping, stopLoop]);

  /** Start/Stop recorder when running flips */
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

  /** After recorder fully stopped, begin REST countdown and then queue next take (or finish) */
  useEffect(() => {
    if (loopPhase !== "rest" || !looping) {
      if (restTimerRef.current != null) {
        clearTimeout(restTimerRef.current);
        restTimerRef.current = null;
      }
      return;
    }
    if (!isRecording && restTimerRef.current == null) {
      restTimerRef.current = window.setTimeout(() => {
        restTimerRef.current = null;
        startRecordPhase(); // guard inside will decide if we can actually start
      }, REST_SEC * 1000);
    }
  }, [loopPhase, looping, isRecording, startRecordPhase]);

  // TS-safe view over PCM (16k mono from the hook)
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

  /** finalize: build one big WAV + one big JSON, show modal */
  const finalizeSession = useCallback(() => {
    if (!takesRef.current.length) {
      setShowExport(false);
      return;
    }
    const merged = concatFloat32(pcmChunksRef.current);
    const sr = sampleRateOut || 16000;
    const wavBlobFinal = encodeWavPCM16(merged, sr);
    const wavUrlFinal = URL.createObjectURL(wavBlobFinal);
    setSessionWavUrl(wavUrlFinal);

    const sessionJson = buildSessionV2({
      sessionId: sessionIdRef.current,
      appBuild: APP_BUILD,
      sampleRateHz: sr,
      takes: takesRef.current,
      takeSampleLengths: sampleCountsRef.current,
    });
    const jsonBlob = new Blob([JSON.stringify(sessionJson, null, 2)], { type: "application/json" });
    const jsonUrl = URL.createObjectURL(jsonBlob);
    setSessionJsonUrl(jsonUrl);

    setShowExport(true);
  }, [sampleRateOut]);

  /** Package ONE take per wavBlob (de-duped), bump packaged++, and stop if we hit the cap */
  useEffect(() => {
    if (!wavBlob || !takePhraseRef.current || !takeWordsRef.current || !takeIdRef.current) return;

    // de-dupe: only package each blob once
    if (lastPackagedBlobRef.current === wavBlob) return;
    lastPackagedBlobRef.current = wavBlob;

    const { take } = buildTakeV2({
      ids: { sessionId: sessionIdRef.current, takeId: takeIdRef.current, subjectId: null },
      appBuild: APP_BUILD,
      phrase: takePhraseRef.current,
      words: takeWordsRef.current,
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
        lyricStrategy,
        lyricSeed: lyricSeedRef.current,
        scale: "major",
      },
      timing: {
        playStartMs: playEpochMsRef.current ?? null,
        recStartMs: startedAtMs ?? null,
      },
      controls: { genderLabel: null },
    });

    // aggregate PCM + take
    if (pcmView && pcmView.length) {
      pcmChunksRef.current.push(new Float32Array(pcmView)); // copy
      sampleCountsRef.current.push(pcmView.length);
    } else {
      pcmChunksRef.current.push(new Float32Array(0));
      sampleCountsRef.current.push(0);
    }
    takesRef.current.push(take);

    // one take completed: packaged++ and inFlight--
    packagedCountRef.current += 1;
    inFlightRef.current = Math.max(0, inFlightRef.current - 1);

    // If we just hit the cap, stop immediately (prevents any queued start)
    if (packagedCountRef.current >= MAX_TAKES) {
      setLooping(false);
      setRunning(false);
      setLoopPhase("idle");
      playEpochMsRef.current = null;
      clearTimers();
      finalizeSession();
    }
  }, [
    wavBlob,
    hzArr,
    confArr,
    rmsDbArr,
    sampleRateOut,
    numSamplesOut,
    durationSec,
    deviceSampleRateHz,
    baseLatencySec,
    workletBufferSize,
    resampleMethod,
    pcmView,
    metrics,
    lowHz,
    highHz,
    lyricStrategy,
    startedAtMs,
    clearTimers,
    finalizeSession,
  ]);

  // Cleanup timers on unmount
  useEffect(() => stopLoop, [stopLoop]);

  // Smooth wall-clock UI timer while recording
  useEffect(() => {
    let raf: number | null = null;
    const tick = () => {
      if (isRecording && playEpochMsRef.current != null) {
        const t = (performance.now() - playEpochMsRef.current) / 1000;
        setUiRecordSec(t);
        raf = requestAnimationFrame(tick);
      }
    };
    if (isRecording && playEpochMsRef.current != null) {
      raf = requestAnimationFrame(tick);
    } else {
      setUiRecordSec(0);
    }
    return () => {
      if (raf) cancelAnimationFrame(raf);
    };
  }, [isRecording, loopPhase]);

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
        phrase={phrase}
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
            onConfirm={(hz) => {
              setLowHz(hz);
              setStep("high");
            }}
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
            onConfirm={(hz) => {
              setHighHz(hz);
              setStep("play");
            }}
          />
        )}

        {step === "play" && (
          <div className="mt-2 grid gap-2 rounded-lg border border-[#d2d2d2] bg-[#ebebeb] p-3">
            <div className="flex items-center justify-between text-sm">
              <div>
                <span className="font-semibold">{statusText}</span>
                {isRecording && (
                  <span className="ml-2 opacity-70">{Math.min(uiRecordSec, RECORD_SEC).toFixed(2)}s</span>
                )}
              </div>
            </div>
            <div className="text-xs opacity-70">
              Record {RECORD_SEC}s → Rest {REST_SEC}s. Auto-stops by {MAX_TAKES} takes or {Math.round(MAX_SESSION_SEC / 60)} minutes.
            </div>
          </div>
        )}
      </GameLayout>

      {showExport && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md">
            <h2 className="text-xl font-semibold mb-2">Training complete</h2>
            <p className="text-sm text-gray-600 mb-4">
              Combined session files for validation. In production, this will upload automatically.
            </p>
            <div className="flex flex-col gap-2">
              {sessionWavUrl && (
                <a className="underline text-blue-700" href={sessionWavUrl} download="session.wav">
                  Download combined WAV
                </a>
              )}
              {sessionJsonUrl && (
                <a className="underline text-blue-700" href={sessionJsonUrl} download="session.json">
                  Download combined JSON
                </a>
              )}
            </div>
            <div className="mt-4 flex justify-end">
              <button className="px-3 py-1.5 rounded-md border" onClick={() => setShowExport(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
