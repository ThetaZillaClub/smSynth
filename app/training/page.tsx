// app/training/page.tsx
"use client";

import React, { useMemo, useState, useEffect, useRef, useCallback } from "react";
import GameLayout from "@/components/game-layout/GameLayout";
import RangeCapture from "@/components/game-layout/range/RangeCapture";
import usePitchDetection from "@/hooks/usePitchDetection";
import useWavRecorder from "@/hooks/useWavRecorder";
import type { Phrase } from "@/components/piano-roll/types";
import { hzToNoteName } from "@/utils/pitch/pitchMath";
import { makeWordLyric } from "@/utils/lyrics/wordBank";
import { buildPhraseFromRangeDiatonic } from "@/utils/phrase/diatonic";

import { APP_BUILD, CONF_THRESHOLD, LEAD_IN_SEC } from "@/utils/training/constants";
import { buildTakeV2 } from "@/utils/take/buildTakeV2";
import useFixedFpsTrace from "@/hooks/useFixedFpsTrace";

type Step = "low" | "high" | "play";

export default function Training() {
  const [step, setStep] = useState<Step>("low");
  const [lowHz, setLowHz] = useState<number | null>(null);
  const [highHz, setHighHz] = useState<number | null>(null);

  const { pitch, confidence, isReady, error } = usePitchDetection("/models/swiftf0", {
    enabled: true, fps: 50, minDb: -45, smoothing: 2, centsTolerance: 3,
  });

  const [running, setRunning] = useState(false);
  const [activeWord, setActiveWord] = useState<number>(-1);
  const [lyricStrategy] = useState<"mixed" | "stableVowel">("mixed");

  useEffect(() => {
    if (step !== "play") setRunning(false);
  }, [step]);

  const pitchText = typeof pitch === "number" ? `${pitch.toFixed(1)} Hz` : "—";
 const noteText =
   typeof pitch === "number"
     ? (() => {
         const { name, octave, cents } = hzToNoteName(pitch, 440, { useSharps: true, octaveAnchor: "A" });
         const dispOct = octave + 1;
         const sign = cents > 0 ? "+" : "";
         return `${name}${dispOct} ${sign}${cents}¢`;
       })()
     : "—";
  const micText = error ? `Mic error: ${String(error)}` : isReady ? "Mic ready" : "Starting mic…";

  const phrase: Phrase | null = useMemo(() => {
    if (step === "play" && lowHz != null && highHz != null) {
      return buildPhraseFromRangeDiatonic(lowHz, highHz, 440);
    }
    return null;
  }, [step, lowHz, highHz]);

  const [words, setWords] = useState<string[] | null>(null);
  const lyricSeedRef = useRef<number>(crypto.getRandomValues(new Uint32Array(1))[0]! >>> 0);
  useEffect(() => {
    if (step === "play" && phrase) {
      lyricSeedRef.current = crypto.getRandomValues(new Uint32Array(1))[0]! >>> 0;
      setWords(makeWordLyric(phrase.notes.length, lyricStrategy, lyricSeedRef.current));
    } else {
      setWords(null);
    }
  }, [step, phrase, lyricStrategy]);

  const {
    isRecording, start: startRec, stop: stopRec, wavBlob, wavUrl, durationSec, clear,
    startedAtMs, endedAtMs, sampleRateOut, deviceSampleRateHz, workletBufferSize,
    baseLatencySec, metrics, numSamplesOut, pcm16k, resampleMethod,
  } = useWavRecorder({ sampleRateOut: 16000 });

  const { hzArr, confArr, rmsDbArr, setLatest, reset: resetFixed } = useFixedFpsTrace(isRecording, 50);
  useEffect(() => {
    setLatest(typeof pitch === "number" ? pitch : null, confidence ?? 0);
  }, [pitch, confidence, setLatest]);

  // Anchor UI start time
  const playEpochMsRef = useRef<number | null>(null);
  useEffect(() => {
    if (running && playEpochMsRef.current == null) playEpochMsRef.current = performance.now();
    if (!running) playEpochMsRef.current = null;
  }, [running]);

  const handleToggle = useCallback(() => {
    if (!running) {
      if (playEpochMsRef.current == null) playEpochMsRef.current = performance.now();
    } else {
      playEpochMsRef.current = null;
    }
    setRunning((r) => !r);
  }, [running]);

  // Auto-stop after phrase completes
  useEffect(() => {
    if (!phrase || !running) return;
    const tail = 0.4;
    const t = setTimeout(() => setRunning(false), Math.max(0, (LEAD_IN_SEC + phrase.durationSec + tail) * 1000));
    return () => clearTimeout(t);
  }, [phrase, running]);

  // Toggle recorder with running flag
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

  // IDs
  const sessionIdRef = useRef<string>(crypto.randomUUID());
  const takeIdRef = useRef<string>("");

  // We DO NOT infer gender here
  const gender_label: "male" | "female" | null = null;

  // TS-safe view over PCM
  const pcmView: Float32Array | null = useMemo(() => {
    if (!pcm16k) return null;
    try {
      const buf = (pcm16k as any).buffer as ArrayBuffer;
      const offset = (pcm16k as any).byteOffset ?? 0;
      const length = (pcm16k as any).length ?? 0;
      return new Float32Array(buf, offset * 4, length);
    } catch {
      return pcm16k as unknown as Float32Array;
    }
  }, [pcm16k]);

  // JSON blob URL
  const [metaUrl, setMetaUrl] = useState<string | null>(null);
  const prevMetaUrlRef = useRef<string | null>(null);

  useEffect(() => {
    if (!wavBlob || !phrase || !words) return;
    if (!takeIdRef.current) takeIdRef.current = crypto.randomUUID();

    const { take } = buildTakeV2({
      ids: { sessionId: sessionIdRef.current, takeId: takeIdRef.current, subjectId: null },
      appBuild: APP_BUILD,
      phrase,
      words,
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
        leadInSec: LEAD_IN_SEC,
        bpm: 120,
        lyricStrategy,
        lyricSeed: lyricSeedRef.current,
        scale: "major",
      },
      timing: {
        playStartMs: playEpochMsRef.current ?? null,
        recStartMs: startedAtMs ?? null,
      },
      controls: { genderLabel: gender_label },
    });

    const blob = new Blob([JSON.stringify(take, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    if (prevMetaUrlRef.current) URL.revokeObjectURL(prevMetaUrlRef.current);
    prevMetaUrlRef.current = url;
    setMetaUrl(url);

    takeIdRef.current = "";

    return () => {
      if (prevMetaUrlRef.current) {
        URL.revokeObjectURL(prevMetaUrlRef.current);
        prevMetaUrlRef.current = null;
      }
    };
  }, [
    wavBlob, phrase, words, durationSec, startedAtMs, sampleRateOut,
    hzArr, confArr, rmsDbArr, metrics, numSamplesOut, pcmView,
    lowHz, highHz, lyricStrategy
  ]);

  return (
    <GameLayout
      title="Training"
      micText={micText}
      error={error}
      running={running}
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
          onConfirm={(hz) => {
            setHighHz(hz);
            setStep("play");
            setRunning(false);
          }}
        />
      )}

      {step === "play" && (
        <div className="mt-2 grid gap-2 rounded-lg border border-[#d2d2d2] bg-[#ebebeb] p-3">
          <div className="flex items-center justify-between text-sm">
            <div>
              <span className="font-semibold">
                {isRecording ? "Recording…" : running ? "Playing…" : "Idle"}
              </span>
              {(isRecording || wavUrl) && (
                <span className="ml-2 opacity-70">{durationSec.toFixed(2)}s</span>
              )}
            </div>
            <div className="flex gap-2">
              {wavUrl && <a className="underline" href={wavUrl} download="take.wav">Download WAV</a>}
              {metaUrl && <a className="underline" href={metaUrl} download="take.json">Download JSON</a>}
              {wavUrl && (
                <button className="px-2 py-1 border rounded" onClick={() => clear()}>
                  Clear
                </button>
              )}
            </div>
          </div>
          <div className="text-xs opacity-70">
            First note is aligned precisely in the JSON; noise is measured before that point.
          </div>
        </div>
      )}
    </GameLayout>
  );
}
