// app/training/page.tsx
"use client";

import React, { useMemo, useState, useEffect, useRef, useCallback } from "react";
import GameLayout from "@/components/game-layout/GameLayout";
import RangeCapture from "@/components/game-layout/range/RangeCapture";
import usePitchDetection from "@/hooks/usePitchDetection";
import { hzToNoteName, midiToHz } from "@/utils/pitch/pitchMath";
import type { Phrase } from "@/components/piano-roll/types";
import { makeWordLyric, getPhonemeForWord } from "@/utils/lyrics/wordBank";
import useWavRecorder from "@/hooks/useWavRecorder";
import { buildPhraseFromRangeDiatonic } from "@/utils/phrase/diatonic";

type Step = "low" | "high" | "play";

// Keep this consistent with PianoRoll/DynamicOverlay defaults
const LEAD_IN_SEC = 1.5;

// deterministic lyric seed per take
const makeSeed = () => crypto.getRandomValues(new Uint32Array(1))[0] >>> 0;

// app build/version if you have one injected at build time
const APP_BUILD = process.env.NEXT_PUBLIC_APP_BUILD ?? "dev";

/** Fixed-FPS trace collector */
function useFixedFpsTrace(enabled: boolean, fps = 60) {
  const [hzArr, setHzArr] = useState<(number | null)[]>([]);
  const [confArr, setConfArr] = useState<number[]>([]);
  const [rmsDbArr, setRmsDbArr] = useState<number[]>([]);

  const latestHzRef = useRef<number | null>(null);
  const latestConfRef = useRef(0);

  // expose setters so parent can feed latest values without re-rendering the timer
  const setLatest = useCallback((hz: number | null, conf: number) => {
    latestHzRef.current = hz;
    latestConfRef.current = conf;
  }, []);

  useEffect(() => {
    if (!enabled) {
      setHzArr([]);
      setConfArr([]);
      setRmsDbArr([]);
      return;
    }
    const dt = 1000 / fps;

    const onRms = (e: Event) => {
      // dispatched in usePitchDetection pushAudio
      const db = (e as CustomEvent).detail?.db ?? -120;
      setRmsDbArr((prev) => [...prev, db]);
    };

    window.addEventListener("audio-rms", onRms as any);
    const id = setInterval(() => {
      setHzArr((prev) => [...prev, latestHzRef.current]);
      setConfArr((prev) => [...prev, latestConfRef.current]);
    }, dt);

    return () => {
      clearInterval(id);
      window.removeEventListener("audio-rms", onRms as any);
    };
  }, [enabled, fps]);

  return { hzArr, confArr, rmsDbArr, setLatest, reset: () => { setHzArr([]); setConfArr([]); setRmsDbArr([]);} };
}

export default function Training() {
  const [step, setStep] = useState<Step>("low");
  const [lowHz, setLowHz] = useState<number | null>(null);
  const [highHz, setHighHz] = useState<number | null>(null);

  // mic always on (range + play)
  const { pitch, confidence, isReady, error } = usePitchDetection("/models/swiftf0", {
    enabled: true,
    fps: 60,
    minDb: -45,
    smoothing: 2,
    centsTolerance: 3,
  });

  // play/scroll state
  const [running, setRunning] = useState(false);
  const [activeWord, setActiveWord] = useState<number>(-1);

  // lyric strategy
  const [lyricStrategy] = useState<"mixed" | "stableVowel">("mixed");

  // stop scrolling unless we're in play
  useEffect(() => {
    if (step !== "play") setRunning(false);
  }, [step]);

  const pitchText = typeof pitch === "number" ? `${pitch.toFixed(1)} Hz` : "—";
  const noteText =
    typeof pitch === "number"
      ? (() => {
          const { name, octave, cents } = hzToNoteName(pitch, 440, { useSharps: true });
          const sign = cents > 0 ? "+" : "";
          return `${name}${octave} ${sign}${cents}¢`;
        })()
      : "—";

  const micText = error ? `Mic error: ${String(error)}` : isReady ? "Mic ready" : "Starting mic…";

  const phrase: Phrase | null = useMemo(() => {
    if (step === "play" && lowHz != null && highHz != null) {
      return buildPhraseFromRangeDiatonic(lowHz, highHz, 440);
    }
    return null;
  }, [step, lowHz, highHz]);

  // words sized to the phrase (stable during a play session), deterministic seed per take
  const [words, setWords] = useState<string[] | null>(null);
  const lyricSeedRef = useRef<number>(makeSeed());
  useEffect(() => {
    if (step === "play" && phrase) {
      lyricSeedRef.current = makeSeed(); // refresh for each new play session
      setWords(makeWordLyric(phrase.notes.length, lyricStrategy, lyricSeedRef.current));
    } else {
      setWords(null);
    }
  }, [step, phrase, lyricStrategy]);

  // ---------- recording + pitch trace ----------
  const {
    isRecording,
    start: startRec,
    stop: stopRec,
    wavBlob,
    wavUrl,
    durationSec,
    clear,
    startedAtMs,   // precise start
    endedAtMs,     // precise end
    sampleRateOut,
    // Added device/env + metrics + PCM
    deviceSampleRateHz,
    workletBufferSize,
    baseLatencySec,
    metrics,           // { rmsDb, maxAbs, clippedPct }
    numSamplesOut,
    pcm24k,            // Float32Array | null
  } = useWavRecorder({ sampleRateOut: 24000 });

  // fixed-fps trace collector at 60fps during recording
  const { hzArr, confArr, rmsDbArr, setLatest, reset: resetFixed } = useFixedFpsTrace(isRecording, 60);

  // keep latest pitch/conf in the fixed-fps collector
  useEffect(() => {
    setLatest(typeof pitch === "number" ? pitch : null, confidence ?? 0);
  }, [pitch, confidence, setLatest]);

  // Track the "play" epoch (overlay also starts its clock on the same transition)
  const playEpochMsRef = useRef<number | null>(null);
  useEffect(() => {
    if (running) playEpochMsRef.current = performance.now();
  }, [running]);

  // Auto-stop after phrase duration (lead-in + small tail)
  useEffect(() => {
    if (!phrase || !running) return;
    const tail = 0.4;
    const t = setTimeout(() => {
      setRunning(false);
    }, Math.max(0, (LEAD_IN_SEC + phrase.durationSec + tail) * 1000));
    return () => clearTimeout(t);
  }, [phrase, running]);

  // start/stop recording in sync with play
  const recLockRef = useRef({ starting: false, stopping: false });
  useEffect(() => {
    (async () => {
      // Start
      if (step === "play" && running && !isRecording && !recLockRef.current.starting) {
        recLockRef.current.starting = true;
        resetFixed(); // reset fixed-fps buffers
        await startRec();
        recLockRef.current.starting = false;
        return;
      }
      // Stop
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

  // Build + expose metadata JSON when a take finishes
  const [metaUrl, setMetaUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!wavBlob || !phrase || !words) return;

    if (!takeIdRef.current) takeIdRef.current = crypto.randomUUID();

    if (metaUrl) {
      URL.revokeObjectURL(metaUrl);
      setMetaUrl(null);
    }

    // Phones aligned 1:1 with words
    const phones = words.map((w) => getPhonemeForWord(w));

    // Musical-time onsets/offsets
    const note_onsets_sec = phrase.notes.map((n) => n.startSec);
    const note_offsets_sec = phrase.notes.map((n) => n.startSec + n.durSec);

    // Alignment into recording
    const playStartMs = playEpochMsRef.current ?? null;
    const recStartMs = startedAtMs ?? null;

    const first_note_at_rec_sec =
      playStartMs != null && recStartMs != null ? LEAD_IN_SEC + (playStartMs - recStartMs) / 1000 : LEAD_IN_SEC;

    const first_note_at_sample = Math.max(0, Math.round(first_note_at_rec_sec * sampleRateOut));
    const note_onsets_samples = note_onsets_sec.map((t) => first_note_at_sample + Math.round(t * sampleRateOut));
    const note_offsets_samples = note_offsets_sec.map((t) => first_note_at_sample + Math.round(t * sampleRateOut));

    // QC metrics (lead-in noise, voiced ratio, simple pass/fail)
    const leadSamples = Math.min(numSamplesOut ?? 0, Math.round(LEAD_IN_SEC * sampleRateOut));
    let noiseDb = -120;
    if (pcm24k && leadSamples > 32) {
      let sum = 0;
      for (let i = 0; i < leadSamples; i++) sum += pcm24k[i] * pcm24k[i];
      const rms = Math.sqrt(sum / leadSamples);
      noiseDb = 20 * Math.log10(rms + 1e-12);
    }
    const voicedCount = hzArr.filter((h) => h != null).length;
    const voicedRatio = hzArr.length ? voicedCount / hzArr.length : 0;

    const peaks = metrics?.maxAbs ?? 0;
    const rmsDb = metrics?.rmsDb ?? -120;
    const clippedPct = metrics?.clippedPct ?? 0;

    // super simple acceptance gate (tune later)
    const passed =
      clippedPct < 0.1 &&
      rmsDb > -35 &&
      (rmsDb - noiseDb) >= 18 && // SNR ≥ 18 dB
      voicedRatio >= 0.4;

    // targets
    const targets_hz = phrase.notes.map((n) => midiToHz(n.midi, 440));

    // Build v2 take JSON
    const takeV2 = {
      version: 2,
      ids: {
        take_id: takeIdRef.current,
        session_id: sessionIdRef.current,
        subject_id: null as string | null,
      },

      created_at: new Date().toISOString(),

      app: {
        build: APP_BUILD,
        platform: { user_agent: (typeof navigator !== "undefined" ? navigator.userAgent : "") },
      },

      audio: {
        wav: {
          sample_rate_hz: sampleRateOut,
          num_channels: 1,
          num_samples: numSamplesOut ?? Math.round(durationSec * sampleRateOut),
        },
        device: {
          input_sample_rate_hz: deviceSampleRateHz ?? 48000,
          base_latency_sec: baseLatencySec ?? null,
          worklet_buffer: workletBufferSize ?? null,
        },
        processing: { downmix: "avg", resample: "linear" },
      },

      prompt: {
        scale: "major",
        a4_hz: 440,
        low_hz: lowHz ?? null,
        high_hz: highHz ?? null,
        bpm: 120,
        lead_in_sec: LEAD_IN_SEC,
        lyric_strategy: lyricStrategy,
        lyric_seed: lyricSeedRef.current,
      },

      phrase,
      targets_hz,

      lyric: {
        words,
        phones,
        align: "one_word_per_note" as const,
      },

      timing: {
        first_note_at_sec: first_note_at_sample / sampleRateOut,
        first_note_at_sample,
        note_onsets_sec,
        note_offsets_sec,
        note_onsets_samples,
        note_offsets_samples,
      },

      pitch: {
        algorithm: "SwiftF0",
        model: "model.onnx",
        // minimal echo of model config; you can inline full swiftf0-config if you like
        trace: {
          fps: 60,
          start_at_sec: 0,
          hz: hzArr,
          conf: confArr,
        },
        rms_db_trace: rmsDbArr, // optional, helpful for denoising research
      },

      qc: {
        peak_abs: peaks,
        rms_dbfs: rmsDb,
        noise_floor_dbfs: noiseDb,
        snr_db: rmsDb - noiseDb,
        clipped_pct: clippedPct,
        voiced_ratio: voicedRatio,
        passed,
        reasons: [] as string[],
      },

      files: {
        wav: "take.wav",
        json: "take.json",
      },

      sanity: {
        notes_count: phrase.notes.length,
        words_count: words.length,
        phones_count: phones.length,
        words_match_notes: words.length === phrase.notes.length,
        phones_match_notes: phones.length === phrase.notes.length,
        first_note_at_sample_gte0: first_note_at_sample >= 0,
        pitch_trace_lengths_match: hzArr.length === confArr.length,
      },
    };

    const blob = new Blob([JSON.stringify(takeV2, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    setMetaUrl(url);

    // prepare for next take id
    takeIdRef.current = "";

    return () => {
      URL.revokeObjectURL(url);
    };
  }, [
    wavBlob,
    phrase,
    words,
    durationSec,
    startedAtMs,
    endedAtMs,
    sampleRateOut,
    hzArr,
    confArr,
    rmsDbArr,
    metrics,
    numSamplesOut,
    pcm24k,
    lowHz,
    highHz,
  ]);

  // ---------- END recording ----------

  return (
    <GameLayout
      title="Training"
      micText={micText}
      error={error}
      // play controls
      running={running}
      onToggle={() => setRunning((r) => !r)}
      // stage & lyrics (only show lyrics in play)
      phrase={phrase}
      lyrics={step === "play" && words ? words : undefined}
      activeLyricIndex={step === "play" ? activeWord : -1}
      onActiveNoteChange={(idx) => setActiveWord(idx)}
      // bottom stats
      pitchText={pitchText}
      noteText={noteText}
      confidence={confidence}
      // live pitch for the roll overlay
      livePitchHz={typeof pitch === "number" ? pitch : null}
      confThreshold={0.5}
    >
      {step === "low" && (
        <RangeCapture
          mode="low"
          active
          pitchHz={typeof pitch === "number" ? pitch : null}
          confidence={confidence}
          confThreshold={0.5}
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
          confThreshold={0.5}
          bpm={60}
          beatsRequired={1}
          centsWindow={75}
          a4Hz={440}
          onConfirm={(hz) => {
            setHighHz(hz);
            setStep("play");
            setRunning(false); // user must click Start
          }}
        />
      )}

      {/* Recorder UI strip (appears during/after takes) */}
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
              {wavUrl && (
                <a className="underline" href={wavUrl} download="take.wav">
                  Download WAV
                </a>
              )}
              {metaUrl && (
                <a className="underline" href={metaUrl} download="take.json">
                  Download JSON
                </a>
              )}
              {wavUrl && (
                <button
                  className="px-2 py-1 border rounded"
                  onClick={() => {
                    clear();
                  }}
                >
                  Clear
                </button>
              )}
            </div>
          </div>
          <div className="text-xs opacity-70">
            First note begins at ≈{LEAD_IN_SEC.toFixed(2)}s after Play (exact in JSON).
          </div>
        </div>
      )}
    </GameLayout>
  );
}
