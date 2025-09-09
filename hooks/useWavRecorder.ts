// hooks/useWavRecorder.ts
"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Metrics = { rmsDb: number; maxAbs: number; clippedPct: number };

/**
 * Lightweight WAV recorder using the same AudioWorklet module as pitch detection.
 * - Always records MONO
 * - Encodes to 16-bit PCM WAV at `sampleRateOut` (default 24000)
 * - Keeps everything on the client (Blob + object URL)
 * - Exposes high-precision start/end timestamps (performance.now() ms)
 * - Exposes simple QC metrics and the resampled PCM (24 kHz) for analytics
 */
export default function useWavRecorder(opts?: {
  sampleRateOut?: number; // default 24000
  bufferSizeMin?: number; // minimum processor buffer size in samples @ device SR (defaults to 1024)
}) {
  const sampleRateOut = opts?.sampleRateOut ?? 24000;
  const bufferSizeMin = Math.max(256, opts?.bufferSizeMin ?? 1024);

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
  const [pcm24k, setPcm24k] = useState<Float32Array | null>(null);

  const ctxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const procRef = useRef<AudioWorkletNode | null>(null);
  const chunksRef = useRef<Float32Array[]>([]);
  const totalRef = useRef(0);
  const deviceSrRef = useRef(48000);

  const metricsRef = useRef<{ sumSq: number; samples: number; maxAbs: number; clip: number }>({
    sumSq: 0,
    samples: 0,
    maxAbs: 0,
    clip: 0,
  });

  const cleanup = useCallback(async () => {
    try { procRef.current?.port?.postMessage("flush"); } catch {}
    try { procRef.current?.disconnect(); } catch {}
    procRef.current = null;

    if (streamRef.current) {
      for (const t of streamRef.current.getTracks()) t.stop();
      streamRef.current = null;
    }
    if (ctxRef.current) {
      try { await ctxRef.current.close(); } catch {}
      ctxRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => { void cleanup(); };
  }, [cleanup]);

  const concat = (arrays: Float32Array[], total: number) => {
    const out = new Float32Array(total);
    let o = 0;
    for (const a of arrays) { out.set(a, o); o += a.length; }
    return out;
  };

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

  const encodeWavPCM16 = (mono: Float32Array, sr: number) => {
    // clamp to [-1, 1] & convert
    const N = mono.length;
    const pcm16 = new Int16Array(N);
    for (let i = 0; i < N; i++) {
      let s = Math.max(-1, Math.min(1, mono[i]));
      pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }

    // RIFF/WAVE header
    const blockAlign = 2; // 16-bit mono
    const byteRate = sr * blockAlign;
    const dataSize = pcm16.byteLength;
    const buf = new ArrayBuffer(44 + dataSize);
    const dv = new DataView(buf);

    let p = 0;
    const wstr = (s: string) => { for (let i = 0; i < s.length; i++) dv.setUint8(p++, s.charCodeAt(i)); };
    const w16  = (v: number) => { dv.setUint16(p, v, true); p += 2; };
    const w32  = (v: number) => { dv.setUint32(p, v, true); p += 4; };

    wstr("RIFF"); w32(36 + dataSize);
    wstr("WAVE");
    wstr("fmt "); w32(16); w16(1); w16(1); w32(sr); w32(byteRate); w16(blockAlign); w16(16);
    wstr("data"); w32(dataSize);
    new Uint8Array(buf, 44).set(new Uint8Array(pcm16.buffer));
    return new Blob([buf], { type: "audio/wav" });
  };

  const start = useCallback(async () => {
    if (isRecording) return;

    // fresh state
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
    setPcm24k(null);

    const AC: typeof AudioContext = (window as any).AudioContext || (window as any).webkitAudioContext;
    const ctx = new AC({ sampleRate: 48000 });
    ctxRef.current = ctx;
    deviceSrRef.current = ctx.sampleRate || 48000;
    setDeviceSampleRateHz(deviceSrRef.current);
    setBaseLatencySec((ctx as any).baseLatency ?? null);

    // Load the same worklet module (downmix→mono & transfer buffers)
    try { await ctx.audioWorklet.addModule("/audio-processor.js"); } catch {}

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        sampleRate: 48000,
      },
    });
    streamRef.current = stream;

    const mic = ctx.createMediaStreamSource(stream);

    // choose buffer size similar to pitch hook
    const deviceSR = ctx.sampleRate || 48000;
    const minBuf = (deviceSR / 24000) * 256;
    let bufferSize = 1024;
    while (bufferSize < Math.max(bufferSizeMin, minBuf)) bufferSize *= 2;
    setWorkletBufferSize(bufferSize);

    const node = new AudioWorkletNode(ctx, "audio-processor", {
      processorOptions: { bufferSize },
    });
    procRef.current = node;

    node.port.onmessage = (ev: MessageEvent) => {
      let data: any = ev.data;
      if (data instanceof ArrayBuffer) {
        data = new Float32Array(data);
      } else if (!(data instanceof Float32Array) && data?.buffer instanceof ArrayBuffer) {
        data = new Float32Array(data.buffer, data.byteOffset || 0, (data.byteLength || data.buffer.byteLength) / 4);
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
      setDurationSec(totalRef.current / deviceSR);
    };

    mic.connect(node);
    setStartedAtMs(performance.now()); // mark the moment audio is flowing to our node
    setIsRecording(true);
  }, [isRecording, wavUrl, bufferSizeMin]);

  const stop = useCallback(async (): Promise<{ blob: Blob; url: string; durationSec: number } | null> => {
    if (!isRecording) return null;
    try {
      procRef.current?.port?.postMessage("flush");
    } catch {}
    await new Promise((r) => setTimeout(r, 0)); // let final postMessage arrive

    const deviceSR = deviceSrRef.current;
    const mono = concat(chunksRef.current, totalRef.current);
    const resampled = resampleLinear(mono, deviceSR, sampleRateOut);
    const blob = encodeWavPCM16(resampled, sampleRateOut);
    const url = URL.createObjectURL(blob);
    setWavBlob(blob);
    setWavUrl(url);
    setIsRecording(false);

    // keep duration based on output rate
    const N = resampled.length;
    const dur = N / sampleRateOut;
    setDurationSec(dur);
    setNumSamplesOut(N);
    setPcm24k(resampled);

    // metrics (computed at device SR) → convert to dBFS scale (identical for float)
    const m = metricsRef.current;
    const rms = Math.sqrt(m.sumSq / Math.max(1, m.samples));
    const rmsDb = 20 * Math.log10(rms + 1e-12);
    const clippedPct = (m.clip / Math.max(1, m.samples)) * 100;
    setMetrics({ rmsDb, maxAbs: m.maxAbs, clippedPct });

    setEndedAtMs(performance.now());

    await cleanup(); // release devices
    return { blob, url, durationSec: dur };
  }, [cleanup, isRecording, sampleRateOut]);

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
    setPcm24k(null);
  }, [wavUrl]);

  return {
    isRecording,
    start,
    stop,
    clear,
    wavBlob,
    wavUrl,
    durationSec,
    sampleRateOut,
    startedAtMs,
    endedAtMs,

    // extras for JSON v2
    deviceSampleRateHz,
    workletBufferSize,
    baseLatencySec,
    metrics,
    numSamplesOut,
    pcm24k,
  };
}
