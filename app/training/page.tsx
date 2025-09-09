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

const LEAD_IN_SEC = 1.5;
const CONF_THRESHOLD = 0.5;
const MIN_NOISE_FRAMES = 10;
const APP_BUILD = process.env.NEXT_PUBLIC_APP_BUILD ?? "dev";

const mean = (a: number[]) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : NaN);
const median = (a: number[]) => {
  if (!a.length) return NaN;
  const s = [...a].sort((x, y) => x - y);
  const i = Math.floor(s.length / 2);
  return s.length % 2 ? s[i] : (s[i - 1] + s[i]) / 2;
};
const dbfs = (rms: number) => 20 * Math.log10(rms + 1e-12);
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

function useFixedFpsTrace(enabled: boolean, fps = 50) {
  const [hzArr, setHzArr] = useState<(number | null)[]>([]);
  const [confArr, setConfArr] = useState<number[]>([]);
  const [rmsDbArr, setRmsDbArr] = useState<number[]>([]);

  const latestHzRef = useRef<number | null>(null);
  const latestConfRef = useRef(0);
  const latestRmsRef = useRef<number>(-120);

  const setLatest = useCallback((hz: number | null, conf: number) => {
    latestHzRef.current = hz;
    latestConfRef.current = conf;
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const dt = 1000 / fps;

    const onRms = (e: Event) => {
      const db = (e as CustomEvent).detail?.db ?? -120;
      latestRmsRef.current = db;
    };

    window.addEventListener("audio-rms", onRms as any);
    const id = setInterval(() => {
      setHzArr((prev) => [...prev, latestHzRef.current]);
      setConfArr((prev) => [...prev, latestConfRef.current]);
      setRmsDbArr((prev) => [...prev, latestRmsRef.current]);
    }, dt);

    return () => {
      clearInterval(id);
      window.removeEventListener("audio-rms", onRms as any);
    };
  }, [enabled, fps]);

  return {
    hzArr,
    confArr,
    rmsDbArr,
    setLatest,
    reset: () => {
      setHzArr([]);
      setConfArr([]);
      setRmsDbArr([]);
    },
  };
}

export default function Training() {
  const [step, setStep] = useState<Step>("low");
  const [lowHz, setLowHz] = useState<number | null>(null);
  const [highHz, setHighHz] = useState<number | null>(null);

  const { pitch, confidence, isReady, error } = usePitchDetection("/models/swiftf0", {
    enabled: true,
    fps: 50,
    minDb: -45,
    smoothing: 2,
    centsTolerance: 3,
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
    isRecording,
    start: startRec,
    stop: stopRec,
    wavBlob,
    wavUrl,
    durationSec,
    clear,
    startedAtMs,
    endedAtMs,
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

  // Capture the moment the user hits Start so the overlay can animate instantly (UI anchor)
  const playEpochMsRef = useRef<number | null>(null);
  useEffect(() => {
    if (running && playEpochMsRef.current == null) {
      playEpochMsRef.current = performance.now();
    }
    if (!running) {
      playEpochMsRef.current = null;
    }
  }, [running]);

  // Smooth toggle: set anchor immediately on click, don't rebase to recorder later
  const handleToggle = useCallback(() => {
    if (!running) {
      if (playEpochMsRef.current == null) playEpochMsRef.current = performance.now();
    } else {
      playEpochMsRef.current = null;
    }
    setRunning((r) => !r);
  }, [running]);

  // Auto-stop after phrase completes (lead-in + phrase + small tail)
  useEffect(() => {
    if (!phrase || !running) return;
    const tail = 0.4;
    const t = setTimeout(() => setRunning(false), Math.max(0, (LEAD_IN_SEC + phrase.durationSec + tail) * 1000));
    return () => clearTimeout(t);
  }, [phrase, running]);

  // Toggle recorder in step=play based on running flag
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

  // We DO NOT infer gender here. Wire from the pre-screen later.
  const gender_label: "male" | "female" | null = null;

  // ---- TS-safe view over PCM (handles ArrayBufferLike / SAB) ----
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

  // JSON blob URL (no dependency on metaUrl itself to avoid loops)
  const [metaUrl, setMetaUrl] = useState<string | null>(null);
  const prevMetaUrlRef = useRef<string | null>(null);

  useEffect(() => {
    if (!wavBlob || !phrase || !words) return;

    if (!takeIdRef.current) takeIdRef.current = crypto.randomUUID();

    const phones = words.map((w) => getPhonemeForWord(w));
    const note_onsets_sec = phrase.notes.map((n) => n.startSec);
    const note_offsets_sec = phrase.notes.map((n) => n.startSec + n.durSec);

    // Drift between UI-start and recorder-start
    const playStartMs = playEpochMsRef.current ?? null;
    const recStartMs = startedAtMs ?? null;
    const driftSec = playStartMs != null && recStartMs != null ? (playStartMs - recStartMs) / 1000 : 0;

    const first_note_at_rec_sec = LEAD_IN_SEC + driftSec;
    const first_note_at_sample = Math.max(0, Math.round(first_note_at_rec_sec * sampleRateOut));
    const note_onsets_samples = note_onsets_sec.map((t) => first_note_at_sample + Math.round(t * sampleRateOut));
    const note_offsets_samples = note_offsets_sec.map((t) => first_note_at_sample + Math.round(t * sampleRateOut));

    // Features from traces
    const fps = 50;
    const frameTimesSec = Array.from({ length: rmsDbArr.length }, (_, i) => i / fps);
    const noiseFrameIdx = frameTimesSec.map((t, i) => (t < first_note_at_rec_sec ? i : -1)).filter((i) => i >= 0);
    const voicedIdx = hzArr
      .map((hz, i) => (hz != null && (confArr[i] ?? 0) >= CONF_THRESHOLD ? i : -1))
      .filter((i) => i >= 0);

    const noiseDbFrames = noiseFrameIdx.length >= MIN_NOISE_FRAMES ? noiseFrameIdx.map((i) => rmsDbArr[i]) : [];
    let noiseDb = -120;
    if (noiseDbFrames.length) {
      noiseDb = mean(noiseDbFrames);
    } else if (rmsDbArr.length) {
      const sorted = [...rmsDbArr].sort((a, b) => a - b);
      const p10 = sorted[Math.max(0, Math.floor(sorted.length * 0.1) - 1)] ?? sorted[0];
      noiseDb = p10;
    }

    const voicedRmsDb = voicedIdx.map((i) => rmsDbArr[i]).filter((x) => isFinite(x));
    const rms_dbfs_voiced = voicedRmsDb.length ? mean(voicedRmsDb) : -120;
    const snr_db_voiced = rms_dbfs_voiced - noiseDb;

    const f0_voiced = voicedIdx.map((i) => hzArr[i] as number).filter((x) => isFinite(x) && x > 0);
    const f0_avg = f0_voiced.length ? mean(f0_voiced) : null;
    const f0_med = f0_voiced.length ? median(f0_voiced) : null;

    // per-note RMS from PCM
    const note_rms_dbfs: number[] = [];
    if (pcmView && note_onsets_samples.length === note_offsets_samples.length) {
      for (let k = 0; k < note_onsets_samples.length; k++) {
        const s0 = clamp(note_onsets_samples[k], 0, pcmView.length);
        const s1 = clamp(note_offsets_samples[k], 0, pcmView.length);
        const L = Math.max(0, s1 - s0);
        if (L < 8) { note_rms_dbfs.push(-120); continue; }
        let sumSq = 0;
        for (let i = s0; i < s1; i++) sumSq += pcmView[i]! * pcmView[i]!;
        note_rms_dbfs.push(dbfs(Math.sqrt(sumSq / L)));
      }
    }

    const clippedPct = metrics?.clippedPct ?? 0;
    const classifyVolume = (r: number, s: number, c: number) => {
      if (c >= 0.5) return "loud";
      if (s >= 18 && r >= -22) return "loud";
      if (s >= 12 && r >= -28) return "normal";
      return "soft";
    };
    const volume_label = classifyVolume(rms_dbfs_voiced, snr_db_voiced, clippedPct);

    const pitch_label = f0_med == null ? null : (f0_med < 180 ? "low" : "high");

    const peaks = metrics?.maxAbs ?? 0;
    const recRmsDb = metrics?.rmsDb ?? -120;
    const reasons: string[] = [];
    if (voicedIdx.length === 0) reasons.push("no_voiced_frames");
    if (snr_db_voiced < 6) reasons.push("low_snr"); // lowered from 8 → 6
    if (clippedPct >= 0.5) reasons.push("heavy_clipping");
    const passed =
      clippedPct < 0.1 &&
      recRmsDb > -35 &&
      snr_db_voiced >= 6 && // lowered from 12 → 6
      (voicedIdx.length / Math.max(1, rmsDbArr.length)) >= 0.4 &&
      reasons.length === 0;

    const targets_hz = phrase.notes.map((n) => midiToHz(n.midi, 440));

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
        processing: { downmix: "avg", resample: resampleMethod },
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
      controls: {
        volume_label,
        pitch_label,
        gender_label,
      },
      features: {
        volume: {
          rms_dbfs_voiced,
          snr_db_voiced,
          note_rms_dbfs,
          method: "50fps_rms_trace voiced-only; pre-first-note RMS as noise reference",
          conf_threshold: CONF_THRESHOLD,
        },
        f0: {
          avg_hz_voiced: f0_avg,
          median_hz_voiced: f0_med,
          conf_threshold: CONF_THRESHOLD,
        },
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
        trace: {
          fps: 50,
          start_at_sec: 0,
          hz: hzArr,
          conf: confArr,
        },
        rms_db_trace: rmsDbArr,
      },
      qc: {
        peak_abs: peaks,
        rms_dbfs: recRmsDb,
        noise_floor_dbfs: noiseDb,
        snr_db: recRmsDb - noiseDb,
        snr_db_voiced,
        clipped_pct: clippedPct,
        voiced_ratio: voicedIdx.length / Math.max(1, rmsDbArr.length),
        passed,
        reasons,
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
        rms_trace_aligned: hzArr.length === rmsDbArr.length,
        voiced_frames_count: voicedIdx.length,
      },
    };

    const blob = new Blob([JSON.stringify(takeV2, null, 2)], { type: "application/json" });
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
    pcmView,
    lowHz,
    highHz,
    lyricStrategy,
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
      // Keep visuals pinned to UI start time (no re-anchoring to recorder)
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
