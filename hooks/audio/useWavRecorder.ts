// hooks/audio/useWavRecorder.ts
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { encodeWavPCM16 } from "@/utils/audio/wav";
import {
  getAudioContext,
  ensureAudioWorkletLoaded,
  createAudioProcessorNode,
  suspendAudio,
  resumeAudio,
} from "@/lib/audioEngine";

type Metrics = { rmsDb: number; maxAbs: number; clippedPct: number };

/**
 * Lightweight WAV recorder using the same AudioWorklet module as pitch detection.
 *
 * ✅ Session-stable design:
 *  - Persistent mic stream/worklet across takes (no re-gUM / no device churn).
 *  - "Armed" gating: the worklet can stay alive; we only buffer audio while recording.
 *  - Provides a `warm()` preflight to build the pipeline before any take starts.
 *  - Keeps everything on the client (Blob + object URL).
 */
export default function useWavRecorder(opts?: {
  sampleRateOut?: number;     // default 16000
  bufferSizeMin?: number;     // min processor buffer size at device SR (default 1024)
  persistentStream?: boolean; // default true — reuse mic/worklet across takes
}) {
  const sampleRateOut = opts?.sampleRateOut ?? 16000;
  const bufferSizeMin = Math.max(256, opts?.bufferSizeMin ?? 1024);
  const persistentStream = opts?.persistentStream ?? true;

  const [isRecording, setIsRecording] = useState(false);
  const [wavBlob, setWavBlob] = useState<Blob | null>(null);
  const [wavUrl, setWavUrl] = useState<string | null>(null);
  const [durationSec, setDurationSec] = useState<number>(0);

  const [startedAtMs, setStartedAtMs] = useState<number | null>(null);
  const [endedAtMs, setEndedAtMs] = useState<number | null>(null);

  const [deviceSampleRateHz, setDeviceSampleRateHz] = useState<number | null>(null);
  const [baseLatencySec, setBaseLatencySec] = useState<number | null>(null);
  const [workletBufferSize, setWorkletBufferSize] = useState<number | null>(null);

  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [numSamplesOut, setNumSamplesOut] = useState<number | null>(null);

  // Expose the resampled PCM (e.g., 16k) and the method used to get there
  const [pcm16k, setPcm16k] = useState<Float32Array | null>(null);
  const [resampleMethod, setResampleMethod] = useState<"fir-decimate" | "linear">("linear");

  const ctxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const micNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const procRef = useRef<AudioWorkletNode | null>(null);

  // Gate to buffer audio only while actively recording
  const captureActiveRef = useRef(false);

  const chunksRef = useRef<Float32Array[]>([]);
  const totalRef = useRef(0);
  const deviceSrRef = useRef(48000);

  const metricsRef = useRef<{ sumSq: number; samples: number; maxAbs: number; clip: number }>({
    sumSq: 0,
    samples: 0,
    maxAbs: 0,
    clip: 0,
  });

  // guard against double start
  const startingRef = useRef(false);

  const concat = (arrays: Float32Array[], total: number) => {
    const out = new Float32Array(total);
    let o = 0;
    for (const a of arrays) {
      out.set(a, o);
      o += a.length;
    }
    return out;
  };

  // FIR design: Hann-windowed low-pass
  const designLowpassFIR = (numTaps: number, cutoffNormFs: number) => {
    const N = numTaps | 0;
    const M = N - 1;
    const h = new Float32Array(N);
    const sinc = (x: number) => (x === 0 ? 1 : Math.sin(Math.PI * x) / (Math.PI * x));
    for (let n = 0; n < N; n++) {
      const k = n - M / 2;
      const w = 0.5 * (1 - Math.cos((2 * Math.PI * n) / M)); // Hann
      h[n] = 2 * cutoffNormFs * sinc(2 * cutoffNormFs * k) * w;
    }
    // normalize DC gain
    let sum = 0;
    for (let i = 0; i < N; i++) sum += h[i]!;
    if (sum !== 0) {
      for (let i = 0; i < N; i++) h[i]! /= sum;
    }
    return h;
  };

  // 48k -> 16k FIR decimator WITH edge padding.
  const decimate48kTo16kFIR = (() => {
    const TAPS = designLowpassFIR(63, 7000 / 48000); // ~7 kHz cutoff (< 8k Nyquist)
    const L = TAPS.length;
    const HALF = (L - 1) >> 1;
    const M = 3;

    return (x: Float32Array) => {
      const N = x.length;
      if (N === 0) return new Float32Array(0);

      const yLen = Math.max(1, Math.round(N / M));
      const y = new Float32Array(yLen);

      const sampleClamped = (idx: number) => {
        if (idx < 0) return x[0]!;
        if (idx >= N) return x[N - 1]!;
        return x[idx]!;
      };

      for (let i = 0; i < yLen; i++) {
        const center = i * M;
        const base = center - HALF;
        let acc = 0;
        for (let k = 0; k < L; k++) acc += sampleClamped(base + k) * TAPS[k]!;
        y[i] = acc;
      }
      return y;
    };
  })();

  const resampleLinear = (buffer: Float32Array, srcRate: number, dstRate: number) => {
    if (srcRate === dstRate) return buffer.slice(0);
    const ratio = srcRate / dstRate;
    const dst = new Float32Array(Math.max(1, Math.round(buffer.length / ratio)));
    for (let i = 0; i < dst.length; i++) {
      const pos = i * ratio;
      const i0 = Math.floor(pos);
      const i1 = Math.min(i0 + 1, buffer.length - 1);
      const frac = pos - i0;
      dst[i] = buffer[i0] * (1 - frac) + buffer[i1] * frac;
    }
    return dst;
  };

  // Internal teardown — used only on unmount or when hard-stopping permanently.
  const teardown = useCallback(async () => {
    try {
      if (procRef.current?.port) (procRef.current.port.onmessage as any) = null;
    } catch {}
    try {
      procRef.current?.port?.postMessage("flush");
    } catch {}
    try {
      procRef.current?.disconnect();
    } catch {}
    procRef.current = null;

    try {
      micNodeRef.current?.disconnect();
    } catch {}
    micNodeRef.current = null;

    if (streamRef.current) {
      for (const t of streamRef.current.getTracks()) t.stop();
      streamRef.current = null;
    }
    // keep shared AC policy consistent with the rest of the app
    void suspendAudio();
    ctxRef.current = null;
  }, []);

  useEffect(() => {
    return () => {
      void teardown();
    };
  }, [teardown]);

  /** Ensure persistent mic + worklet are created and wired once. */
  const ensurePipeline = useCallback(async () => {
    if (procRef.current && micNodeRef.current && streamRef.current && ctxRef.current) return;

    const ctx = getAudioContext();
    ctxRef.current = ctx;
    deviceSrRef.current = ctx.sampleRate || 48000;
    setDeviceSampleRateHz(deviceSrRef.current);
    setBaseLatencySec((ctx as any).baseLatency ?? null);

    await ensureAudioWorkletLoaded(ctx);
    await resumeAudio();

    if (!streamRef.current) {
      streamRef.current = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          sampleRate: 48000,
        },
      });
    }

    if (!micNodeRef.current) {
      micNodeRef.current = ctx.createMediaStreamSource(streamRef.current);
    }

    if (!procRef.current) {
      // choose buffer size similar to pitch hook
      const deviceSR = ctx.sampleRate || 48000;
      const minBuf = (deviceSR / sampleRateOut) * 256;
      let bufferSize = 1024;
      while (bufferSize < Math.max(bufferSizeMin, minBuf)) bufferSize *= 2;
      setWorkletBufferSize(bufferSize);

      const node = await createAudioProcessorNode({ bufferSize }, ctx);
      procRef.current = node;

      node.port.onmessage = (ev: MessageEvent) => {
        // Gate — ignore chunks unless we're actively recording
        if (!captureActiveRef.current) return;

        let data: any = ev.data;
        if (data instanceof ArrayBuffer) {
          data = new Float32Array(data);
        } else if (!(data instanceof Float32Array) && data?.buffer instanceof ArrayBuffer) {
          data = new Float32Array(
            data.buffer,
            data.byteOffset || 0,
            (data.byteLength || data.buffer.byteLength) / 4
          );
        }
        if (!(data instanceof Float32Array) || !data.length) return;

        // metrics at device SR
        let maxA = metricsRef.current.maxAbs;
        let sumSq = metricsRef.current.sumSq;
        let clip = metricsRef.current.clip;
        for (let i = 0; i < data.length; i++) {
          const x = data[i];
          const a = Math.abs(x);
          if (a > maxA) maxA = a;
          if (a >= 0.999) clip++;
          sumSq += x * x;
        }
        metricsRef.current.maxAbs = maxA;
        metricsRef.current.sumSq = sumSq;
        metricsRef.current.samples += data.length;

        chunksRef.current.push(data);
        totalRef.current += data.length;

        const sr = deviceSrRef.current || (ctx.sampleRate || 48000);
        setDurationSec(totalRef.current / sr);
      };

      micNodeRef.current.connect(node);
    }
  }, [bufferSizeMin, sampleRateOut]);

  /** 🔥 Preflight: build the mic/worklet pipeline without starting capture. */
  const warm = useCallback(async () => {
    await ensurePipeline();
  }, [ensurePipeline]);

  const start = useCallback(async () => {
    if (isRecording || startingRef.current) return;
    startingRef.current = true;

    try {
      await ensurePipeline();

      // fresh state for a new take
      chunksRef.current = [];
      totalRef.current = 0;
      metricsRef.current = { sumSq: 0, samples: 0, maxAbs: 0, clip: 0 };
      setWavBlob(null);
      if (wavUrl) URL.revokeObjectURL(wavUrl);
      setWavUrl(null);
      setDurationSec(0);
      setEndedAtMs(null);
      setMetrics(null);
      setNumSamplesOut(null);
      setPcm16k(null);
      setResampleMethod("linear");

      // arm capture
      await resumeAudio();
      captureActiveRef.current = true;
      setStartedAtMs(performance.now());
      setIsRecording(true);
    } finally {
      startingRef.current = false;
    }
  }, [ensurePipeline, isRecording, wavUrl]);

  const stop = useCallback(async (): Promise<{ blob: Blob; url: string; durationSec: number } | null> => {
    if (!isRecording) return null;

    // disarm capture (pipeline stays alive if persistent)
    captureActiveRef.current = false;

    // let the last postMessage land
    try {
      procRef.current?.port?.postMessage("flush");
    } catch {}
    await new Promise((r) => setTimeout(r, 0));

    const deviceSR = deviceSrRef.current;
    const mono = concat(chunksRef.current, totalRef.current);

    // Choose resampler
    let resampled: Float32Array;
    if (deviceSR === 48000 && sampleRateOut === 16000) {
      resampled = decimate48kTo16kFIR(mono);
      setResampleMethod("fir-decimate");
    } else if (deviceSR === sampleRateOut) {
      resampled = mono;
      setResampleMethod("linear");
    } else {
      resampled = resampleLinear(mono, deviceSR, sampleRateOut);
      setResampleMethod("linear");
    }

    const blob = encodeWavPCM16(resampled, sampleRateOut);
    const url = URL.createObjectURL(blob);
    setWavBlob(blob);
    setWavUrl(url);
    setIsRecording(false);

    const N = resampled.length;
    const dur = N / sampleRateOut;
    setDurationSec(dur);
    setNumSamplesOut(N);
    setPcm16k(resampled);

    // metrics (computed at device SR)
    const m = metricsRef.current;
    const rms = Math.sqrt(m.sumSq / Math.max(1, m.samples));
    const rmsDb = 20 * Math.log10(rms + 1e-12);
    const clippedPct = (m.clip / Math.max(1, m.samples)) * 100;
    setMetrics({ rmsDb, maxAbs: m.maxAbs, clippedPct });

    setEndedAtMs(performance.now());

    // IMPORTANT: do NOT teardown here if persistent
    if (!persistentStream) {
      await teardown();
    }

    return { blob, url, durationSec: dur };
  }, [decimate48kTo16kFIR, isRecording, persistentStream, resampleLinear, sampleRateOut, teardown]);

  const clear = useCallback(() => {
    setWavBlob(null);
    if (wavUrl) URL.revokeObjectURL(wavUrl);
    setWavUrl(null);
    setDurationSec(0);
    chunksRef.current = [];
    totalRef.current = 0;
    setStartedAtMs(null);
    setEndedAtMs(null);
    setMetrics(null);
    setNumSamplesOut(null);
    setPcm16k(null);
    setResampleMethod("linear");
  }, [wavUrl]);

  return {
    // state
    isRecording,
    wavBlob,
    wavUrl,
    durationSec,
    sampleRateOut,
    startedAtMs,
    endedAtMs,

    // controls
    warm,   // ⬅️ preflight the pipeline (no capture)
    start,
    stop,
    clear,

    // diagnostics
    deviceSampleRateHz,
    workletBufferSize,
    baseLatencySec,
    metrics,
    numSamplesOut,

    // analytics buffer + provenance
    pcm16k,
    resampleMethod,
  };
}
