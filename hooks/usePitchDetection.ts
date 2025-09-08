"use client";

// SwiftF0 (ONNX Runtime Web) real-time pitch detection (24 kHz target SR)
//  • Strict single EP selection to avoid provider-mismatch warnings
//  • WASM by default (SIMD+threads) — clean logs and solid perf
//  • Optional WebGPU preflight (uses WebGPU only if adapter is usable)

import { useEffect, useRef, useState, useCallback } from "react";
import * as ort from "onnxruntime-web";
import { initOrtEnv } from "@/lib/ortSetup";

export type PitchDetectionOptions = {
  enabled?: boolean;
  fps?: number;
  minDb?: number;
  centsTolerance?: number;
  smoothing?: number;
};

export type PitchDetectionState = {
  pitch: number | null;
  confidence: number;
  isReady: boolean;
  error: string | null;
};

export default function usePitchDetection(
  modelDir: string = "/models/swiftf0",
  opts: PitchDetectionOptions = {}
): PitchDetectionState {
  const { enabled = true, fps = 60, minDb = -40, centsTolerance = 3, smoothing = 1 } = opts;

  const MIN_INTERVAL = 1000 / fps;

  const [pitch, setPitch] = useState<number | null>(null);
  const [confidence, setConfidence] = useState(0);
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Audio
  const ctxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const procRef = useRef<AudioWorkletNode | null>(null);
  const abortRef = useRef<AbortController | null>(null); // still used for our own flow control
  const lastEmit = useRef<{ t: number; hz: number | null }>({ t: 0, hz: null });

  // ORT / SwiftF0
  const sessionRef = useRef<ort.InferenceSession | null>(null);
  const inputNameRef = useRef<string | null>(null);
  // keep as readonly; we don't mutate it
  const outNamesRef = useRef<readonly string[]>([]);

  // Runtime config (loaded from swiftf0-config.json)
  const runtimeCfgLoaded = useRef(false);
  const cfgRef = useRef<{
    fmin?: number;
    fmax?: number;
    confidence_threshold?: number;
    window_seconds?: number;
    backend?: "wasm" | "webgpu";
    target_sample_rate?: number;
    ep_strict_single?: boolean;
    webgpu_require_shader_f16?: boolean;
  }>({
    fmin: 46.875,
    fmax: 2093.75,
    confidence_threshold: 0.6,
    window_seconds: 0.2,
    backend: "wasm",
    target_sample_rate: 24000,
    ep_strict_single: true,
    webgpu_require_shader_f16: false,
  });

  const targetSrRef = useRef(24000);
  const ringRef = useRef<{ data: Float32Array; writeIdx: number; totalWritten: number }>({
    data: new Float32Array(24000 * 1),
    writeIdx: 0,
    totalWritten: 0,
  });

  const smoothRef = useRef<Array<{ hz: number; conf: number }>>([]);
  const inferBusyRef = useRef(false);
  const gateActiveRef = useRef(false);

  const median = (arr: number[]) => {
    const v = arr.filter((x) => x != null).sort((a, b) => a - b);
    return v.length ? v[Math.floor(v.length / 2)] : null;
  };

  const emit = useCallback(
    (hz: number | null, conf?: number) => {
      if (hz == null) {
        smoothRef.current.length = 0;
        lastEmit.current.hz = null;
        setPitch(null);
        setConfidence(conf || 0);
        return;
      }
      const buf = smoothRef.current;
      buf.push({ hz, conf: conf ?? 0 });
      if (buf.length > smoothing) buf.shift();

      const medHz = median(buf.map((b) => b.hz));
      const avgConf = buf.reduce((s, b) => s + (b.conf || 0), 0) / (buf.length || 1);

      const prevHz = lastEmit.current.hz;
      const centsDiff = (a: number, b: number) => 1200 * Math.log2(a / b);
      const changed =
        (medHz === null && prevHz !== null) ||
        (medHz !== null && (prevHz === null || Math.abs(centsDiff(medHz, prevHz)) >= centsTolerance));

      if (changed) {
        lastEmit.current.hz = medHz ?? null;
        setPitch(medHz ?? null);
        setConfidence(avgConf || 0);
      }
    },
    [centsTolerance, smoothing]
  );

  const hardMute = useCallback(() => {
    const ring = ringRef.current;
    ring.data.fill(0);
    ring.writeIdx = 0;
    ring.totalWritten = ring.data.length;
    smoothRef.current.length = 0;
    lastEmit.current.hz = null;
    setPitch(null);
    setConfidence(0);
  }, []);

  const latestWindow = useCallback((): Float32Array | null => {
    const ring = ringRef.current;
    const N = ring.data.length;
    const w = ring.writeIdx;

    const minNeeded = Math.min(N, targetSrRef.current); // ≥1 sec
    if (ring.totalWritten < minNeeded) return null;

    if (w === 0) return ring.data.slice(0);
    const out = new Float32Array(N);
    out.set(ring.data.subarray(w), 0);
    out.set(ring.data.subarray(0, w), N - w);
    return out;
  }, []);

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

  /* -------------------------- EP preflight --------------------------- */
  const canUseWebGPU = useCallback(async () => {
    if (!("gpu" in navigator)) return false;
    try {
      const adapter = await (navigator as any).gpu.requestAdapter();
      if (!adapter) return false;

      if (cfgRef.current.webgpu_require_shader_f16 && !adapter.features.has("shader-f16")) {
        return false;
      }
      return true;
    } catch {
      return false;
    }
  }, []);

  const chooseExecutionProvider = useCallback(async () => {
    const want = (cfgRef.current.backend || "wasm").toLowerCase();
    const strictSingle = !!cfgRef.current.ep_strict_single;

    if (want === "webgpu") {
      const ok = await canUseWebGPU();
      if (ok) {
        // single provider to avoid mismatch warnings
        return { providers: (["webgpu"] as const) };
      }
      return { providers: (["wasm"] as const) };
    }
    return { providers: (["wasm"] as const) };
  }, [canUseWebGPU]);

  /* ---------------------------- Inference ---------------------------- */
  const inferLatest = useCallback(async () => {
    if (inferBusyRef.current) return;
    const session = sessionRef.current;
    if (!session) return;

    const win = latestWindow();
    if (!win) {
      emit(null, 0);
      return;
    }

    inferBusyRef.current = true;
    try {
      const audio = new ort.Tensor("float32", win, [1, win.length]);
      // ORT Web: only (feeds, options?) overload — no "fetches" param
      const outputs = await session.run({ [inputNameRef.current as string]: audio });

      const outTensors = Object.values(outputs);
      let pitchHz: number | null = null,
        conf: number | null = null;

      if ((outputs as any).pitch_hz && (outputs as any).confidence) {
        const p = (outputs as any).pitch_hz.data as Float32Array;
        const c = (outputs as any).confidence.data as Float32Array;
        pitchHz = p[p.length - 1] ?? null;
        conf = c[c.length - 1] ?? 0;
      } else if (outTensors.length === 2) {
        const p = (outTensors[0] as ort.Tensor).data as Float32Array;
        const c = (outTensors[1] as ort.Tensor).data as Float32Array;
        pitchHz = p[p.length - 1] ?? null;
        conf = c[c.length - 1] ?? 0;
      } else if (outTensors.length === 1) {
        const v = (outTensors[0] as ort.Tensor).data as Float32Array;
        const half = Math.floor(v.length / 2);
        pitchHz = v[half - 1] ?? null;
        conf = v[v.length - 1] ?? 0;
      }

      const { fmin = 46.875, fmax = 2093.75, confidence_threshold = 0.6 } = cfgRef.current;
      const voiced =
        (conf ?? 0) >= confidence_threshold &&
        (pitchHz == null || (pitchHz >= fmin && pitchHz <= fmax));
      emit(voiced ? pitchHz : null, conf ?? 0);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("SwiftF0 ORT inference failed:", e);
      setError(`SwiftF0 inference failed: ${(e as any)?.message || String(e)}`);
    } finally {
      inferBusyRef.current = false;
    }
  }, [emit, latestWindow]);

  /* ----------------------------- Audio ------------------------------ */
  const pushAudio = useCallback(
    (monoFloat32AtDeviceRate: Float32Array, deviceSampleRate: number) => {
      let sumSq = 0;
      for (let i = 0; i < monoFloat32AtDeviceRate.length; i++) sumSq += monoFloat32AtDeviceRate[i] ** 2;
      const rmsDb = 20 * Math.log10(Math.sqrt(sumSq / monoFloat32AtDeviceRate.length) + 1e-12);
      try {
        window.dispatchEvent(new CustomEvent("audio-rms", { detail: { db: rmsDb } }));
      } catch {}

      if (rmsDb < minDb) {
        if (!gateActiveRef.current) {
          gateActiveRef.current = true;
          hardMute();
          emit(null, 0);
        }
        return;
      }
      if (gateActiveRef.current) gateActiveRef.current = false;

      const targetSr = targetSrRef.current;
      const monoDst = resampleLinear(monoFloat32AtDeviceRate, deviceSampleRate, targetSr);

      const ring = ringRef.current;
      const N = ring.data.length;
      let w = ring.writeIdx;
      for (let i = 0; i < monoDst.length; i++) {
        ring.data[w] = monoDst[i];
        w = (w + 1) % N;
      }
      ring.writeIdx = w;
      ring.totalWritten += monoDst.length;
    },
    [minDb, hardMute, emit]
  );

  /* -------------------------- Session setup ------------------------- */
  const setupSession = useCallback(
    async (dir: string) => {
      initOrtEnv();

      try {
        if (!runtimeCfgLoaded.current) {
          const res = await fetch(`${dir.replace(/\/$/, "")}/swiftf0-config.json`, { cache: "no-cache" });
          if (res.ok) cfgRef.current = await res.json();
          runtimeCfgLoaded.current = true;
        }
      } catch {
        /* keep defaults */
      }

      const seconds = Number(cfgRef.current.window_seconds) > 0 ? Number(cfgRef.current.window_seconds) : 0.2;
      const targetSr = Number(cfgRef.current.target_sample_rate) > 0 ? Number(cfgRef.current.target_sample_rate) : 24000;
      targetSrRef.current = targetSr;

      ringRef.current.data = new Float32Array(Math.max(1, Math.round(targetSr * seconds)));
      ringRef.current.writeIdx = 0;
      ringRef.current.totalWritten = 0;

      // Choose exactly ONE EP to avoid provider mismatch warnings.
      const { providers } = await chooseExecutionProvider();

      const session = await ort.InferenceSession.create(`${dir.replace(/\/$/, "")}/model.onnx`, {
        // ORT Web expects string[] of provider names (e.g., ['wasm'] or ['webgpu'])
        executionProviders: providers as unknown as string[],
        // ORT Web accepts string literal for optimization level
        graphOptimizationLevel: "all",
      });

      sessionRef.current = session;
      inputNameRef.current =
        session.inputNames?.[0] ?? Object.keys(session.inputMetadata ?? {})[0] ?? "input";
      outNamesRef.current = session.outputNames?.length
        ? session.outputNames.slice() // copy to avoid readonly assignment issues
        : Object.keys(session.outputMetadata ?? {});

      // Warmup with the correct shape
      const warm = new ort.Tensor("float32", new Float32Array(ringRef.current.data.length), [
        1,
        ringRef.current.data.length,
      ]);
      try {
        await session.run({ [inputNameRef.current as string]: warm });
      } catch {}

      setError(null);
    },
    [chooseExecutionProvider]
  );

  /* --------------------------- start/stop ---------------------------- */
  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;

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

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (ctxRef.current) {
      ctxRef.current.close();
      ctxRef.current = null;
    }

    setIsReady(false);
    setPitch(null);
    setConfidence(0);
    smoothRef.current.length = 0;
    lastEmit.current.hz = null;
    gateActiveRef.current = false;
  }, []);

  const start = useCallback(async () => {
    if (!enabled) return;

    const ac = new AbortController();
    abortRef.current = ac;

    try {
      if (!sessionRef.current) await setupSession(modelDir);

      const AC: typeof AudioContext =
        (window as any).AudioContext || (window as any).webkitAudioContext;
      ctxRef.current = new AC({ sampleRate: 48000 });
      try {
        await ctxRef.current.audioWorklet.addModule("/audio-processor.js");
      } catch {}
      if (ctxRef.current.state === "suspended") await ctxRef.current.resume();

      // NOTE: 'signal' is not in TS typings for MediaStreamConstraints; omit it.
      streamRef.current = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 48000,
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });
      const mic = ctxRef.current.createMediaStreamSource(streamRef.current);

      const deviceSR = ctxRef.current.sampleRate || 48000;
      const targetSR = targetSrRef.current;
      const minBuf = (deviceSR / targetSR) * 256;
      let bufferSize = 1024;
      while (bufferSize < minBuf) bufferSize *= 2;
      if (bufferSize < 1024) bufferSize = 1024;

      procRef.current = new AudioWorkletNode(ctxRef.current, "audio-processor", {
        processorOptions: { bufferSize },
      });

      procRef.current.port.onmessage = (ev: MessageEvent) => {
        const ctx = ctxRef.current;
        if (!ctx) return;

        let data: Float32Array | ArrayBuffer | any = ev.data;
        if (data instanceof ArrayBuffer) {
          data = new Float32Array(data);
        } else if (!(data instanceof Float32Array) && data?.buffer instanceof ArrayBuffer) {
          try {
            data = new Float32Array(
              data.buffer,
              (data.byteOffset as number) || 0,
              ((data.byteLength as number) || data.buffer.byteLength) / 4
            );
          } catch {
            data = new Float32Array(data.buffer);
          }
        }
        if (!(data instanceof Float32Array) || !data.length) return;

        pushAudio(data, deviceSR);

        const now = performance.now();
        if (now - lastEmit.current.t >= MIN_INTERVAL) {
          lastEmit.current.t = now;
          void inferLatest(); // fire-and-forget
        }
      };

      mic.connect(procRef.current);
      setError(null);
      setIsReady(true);
    } catch (e) {
      if ((e as any)?.name !== "AbortError") setError((e as any)?.message || String(e));
      stop();
    }
  }, [enabled, modelDir, MIN_INTERVAL, pushAudio, inferLatest, setupSession, stop]);

  useEffect(() => {
    if (!enabled) {
      stop();
      return () => {};
    }
    const id = setTimeout(() => {
      void start();
    }, 50);
    return () => {
      clearTimeout(id);
      stop();
    };
  }, [enabled, start, stop]);

  return { pitch, confidence, isReady, error };
}
