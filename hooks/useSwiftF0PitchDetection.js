// hooks/useSwiftF0PitchDetection.js
// ----------------------------------------------------------------------------
// SwiftF0 (ONNX Runtime Web) real-time pitch detection (24 kHz target SR)
//  • Strict single EP selection to avoid provider-mismatch warnings
//  • WASM by default (SIMD+threads) — clean logs and solid perf
//  • Optional WebGPU preflight (uses WebGPU only if adapter is usable)
// ----------------------------------------------------------------------------
import { useEffect, useRef, useState, useCallback } from 'react';
import * as ort from 'onnxruntime-web';
import { initOrtEnv } from '@/lib/ortSetup';

export default function useSwiftF0PitchDetection(
  modelDir = '/models/swiftf0',
  opts     = {},
) {
  const {
    enabled        = true,
    fps            = 60,
    minDb          = -40,
    centsTolerance = 3,
    smoothing      = 1,
  } = opts;

  const MIN_INTERVAL = 1000 / fps;

  const [pitch,      setPitch]      = useState(null);
  const [confidence, setConfidence] = useState(0);
  const [isReady,    setIsReady]    = useState(false);
  const [error,      setError]      = useState(null);

  // Audio
  const ctxRef     = useRef(null);
  const streamRef  = useRef(null);
  const procRef    = useRef(null);
  const abortRef   = useRef(null);
  const lastEmit   = useRef({ t: 0, hz: null });

  // ORT / SwiftF0
  const sessionRef   = useRef(null);
  const inputNameRef = useRef(null);
  const outNamesRef  = useRef([]);

  // Runtime config (loaded from swiftf0-config.json)
  const runtimeCfgLoaded = useRef(false);
  const cfgRef = useRef({
    fmin: 46.875,
    fmax: 2093.75,
    confidence_threshold: 0.6,
    window_seconds: 0.2,
    backend: 'wasm',
    target_sample_rate: 24000,
    ep_strict_single: true,
    webgpu_require_shader_f16: false,
  });

  const targetSrRef = useRef(24000);
  const ringRef = useRef({
    data: new Float32Array(24000 * 1),
    writeIdx: 0,
    totalWritten: 0,
  });

  const smoothRef     = useRef([]);
  const inferBusyRef  = useRef(false);
  const gateActiveRef = useRef(false);

  const median = (arr) => {
    const v = arr.filter(x => x != null).sort((a, b) => a - b);
    return v.length ? v[Math.floor(v.length / 2)] : null;
  };

  const emit = useCallback((hz, conf) => {
    if (hz == null) {
      smoothRef.current.length = 0;
      lastEmit.current.hz = null;
      setPitch(null);
      setConfidence(conf || 0);
      return;
    }
    const buf = smoothRef.current;
    buf.push({ hz, conf });
    if (buf.length > smoothing) buf.shift();

    const medHz   = median(buf.map(b => b.hz));
    const avgConf = buf.reduce((s, b) => s + (b.conf || 0), 0) / (buf.length || 1);

    const prevHz = lastEmit.current.hz;
    const centsDiff = (a, b) => 1200 * Math.log2(a / b);
    const changed = (medHz === null && prevHz !== null) ||
                    (medHz !== null && (prevHz === null ||
                      Math.abs(centsDiff(medHz, prevHz)) >= centsTolerance));

    if (changed) {
      lastEmit.current.hz = medHz;
      setPitch(medHz);
      setConfidence(avgConf || 0);
    }
  }, [centsTolerance, smoothing]);

  const hardMute = useCallback(() => {
    const ring = ringRef.current;
    ring.data.fill(0);
    ring.writeIdx     = 0;
    ring.totalWritten = ring.data.length;
    smoothRef.current.length = 0;
    lastEmit.current.hz = null;
    setPitch(null);
    setConfidence(0);
  }, []);

  const latestWindow = useCallback(() => {
    const ring = ringRef.current;
    const N    = ring.data.length;
    const w    = ring.writeIdx;

    const minNeeded = Math.min(N, targetSrRef.current); // ≥1 sec
    if (ring.totalWritten < minNeeded) return null;

    if (w === 0) return ring.data.slice(0);
    const out = new Float32Array(N);
    out.set(ring.data.subarray(w), 0);
    out.set(ring.data.subarray(0, w), N - w);
    return out;
  }, []);

  const resampleLinear = (buffer, srcRate, dstRate) => {
    if (srcRate === dstRate) return buffer.slice(0);
    const ratio = srcRate / dstRate;
    const dst   = new Float32Array(Math.max(1, Math.round(buffer.length / ratio)));
    for (let i = 0; i < dst.length; i++) {
      const pos  = i * ratio;
      const i0   = Math.floor(pos);
      const i1   = Math.min(i0 + 1, buffer.length - 1);
      const frac = pos - i0;
      dst[i] = buffer[i0] * (1 - frac) + buffer[i1] * frac;
    }
    return dst;
  };

  /* -------------------------- EP preflight --------------------------- */
  const canUseWebGPU = useCallback(async () => {
    if (!('gpu' in navigator)) return false;
    try {
      const adapter = await navigator.gpu.requestAdapter();
      if (!adapter) return false;

      // Optional: require shader-f16 if requested
      if (cfgRef.current.webgpu_require_shader_f16 && !adapter.features.has('shader-f16')) {
        return false;
      }
      // We could also check limits if desired.
      return true;
    } catch {
      return false;
    }
  }, []);

  const chooseExecutionProvider = useCallback(async () => {
    const want = (cfgRef.current.backend || 'wasm').toLowerCase();
    const strictSingle = !!cfgRef.current.ep_strict_single;

    if (want === 'webgpu') {
      const ok = await canUseWebGPU();
      if (ok) {
        return { providers: strictSingle ? ['webgpu'] : ['webgpu'] }; // single by design
      }
      // fall back cleanly before creating any session
      return { providers: ['wasm'] };
    }
    // default: WASM only
    return { providers: ['wasm'] };
  }, [canUseWebGPU]);

  /* ---------------------------- Inference ---------------------------- */
  const inferLatest = useCallback(async () => {
    if (inferBusyRef.current) return;
    const session = sessionRef.current;
    if (!session) return;

    const win = latestWindow();
    if (!win) { emit(null, 0); return; }

    inferBusyRef.current = true;
    try {
      const audio = new ort.Tensor('float32', win, [1, win.length]);
      const outputs = await session.run(
        { [inputNameRef.current]: audio },
        outNamesRef.current.length ? outNamesRef.current : undefined
      );

      const outTensors = Object.values(outputs);
      let pitchHz = null, conf = null;

      if (outputs.pitch_hz && outputs.confidence) {
        const p = outputs.pitch_hz.data;
        const c = outputs.confidence.data;
        pitchHz = p[p.length - 1] ?? null;
        conf    = c[c.length - 1] ?? 0;
      } else if (outTensors.length === 2) {
        const p = outTensors[0].data, c = outTensors[1].data;
        pitchHz = p[p.length - 1] ?? null;
        conf    = c[c.length - 1] ?? 0;
      } else if (outTensors.length === 1) {
        const v = outTensors[0].data;
        const half = Math.floor(v.length / 2);
        pitchHz = v[half - 1] ?? null;
        conf    = v[v.length - 1] ?? 0;
      }

      const { fmin, fmax, confidence_threshold } = cfgRef.current;
      const voiced = (conf ?? 0) >= (confidence_threshold ?? 0.6)
                  && (pitchHz == null || (pitchHz >= (fmin ?? 46.875) && pitchHz <= (fmax ?? 2093.75)));
      emit(voiced ? pitchHz : null, conf ?? 0);
    } catch (e) {
      console.error('SwiftF0 ORT inference failed:', e);
      setError(`SwiftF0 inference failed: ${e.message || e}`);
    } finally {
      inferBusyRef.current = false;
    }
  }, [emit, latestWindow]);

  /* ----------------------------- Audio ------------------------------ */
  const pushAudio = useCallback((monoFloat32AtDeviceRate, deviceSampleRate) => {
    let sumSq = 0;
    for (let i = 0; i < monoFloat32AtDeviceRate.length; i++) sumSq += monoFloat32AtDeviceRate[i] ** 2;
    const rmsDb = 20 * Math.log10(Math.sqrt(sumSq / monoFloat32AtDeviceRate.length) + 1e-12);
    try { window.dispatchEvent(new CustomEvent('audio-rms', { detail: { db: rmsDb } })); } catch {}

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
    const monoDst  = resampleLinear(monoFloat32AtDeviceRate, deviceSampleRate, targetSr);

    const ring = ringRef.current;
    const N = ring.data.length;
    let w = ring.writeIdx;
    for (let i = 0; i < monoDst.length; i++) {
      ring.data[w] = monoDst[i];
      w = (w + 1) % N;
    }
    ring.writeIdx = w;
    ring.totalWritten += monoDst.length;
  }, [minDb, hardMute, emit]);

  /* -------------------------- Session setup ------------------------- */
  const setupSession = useCallback(async (dir) => {
    initOrtEnv();

    try {
      if (!runtimeCfgLoaded.current) {
        const res = await fetch(`${dir.replace(/\/$/, '')}/swiftf0-config.json`, { cache: 'no-cache' });
        if (res.ok) cfgRef.current = await res.json();
        runtimeCfgLoaded.current = true;
      }
    } catch { /* keep defaults */ }

    const seconds  = Number(cfgRef.current.window_seconds) > 0 ? Number(cfgRef.current.window_seconds) : 0.2;
    const targetSr = Number(cfgRef.current.target_sample_rate) > 0 ? Number(cfgRef.current.target_sample_rate) : 24000;
    targetSrRef.current = targetSr;

    ringRef.current.data         = new Float32Array(Math.max(1, Math.round(targetSr * seconds)));
    ringRef.current.writeIdx     = 0;
    ringRef.current.totalWritten = 0;

    // Choose exactly ONE EP to avoid provider mismatch warnings.
    const { providers } = await chooseExecutionProvider();

    const session = await ort.InferenceSession.create(
      `${dir.replace(/\/$/, '')}/model.onnx`,
      {
        executionProviders: providers,    // e.g. ['wasm'] or ['webgpu']
        graphOptimizationLevel: 'all',    // small perf win
        // logLevel left as default 'info' — we expect no provider mismatch now
      }
    );

    sessionRef.current   = session;
    inputNameRef.current = session.inputNames?.[0]
      ?? Object.keys(session.inputMetadata ?? {})[0]
      ?? 'input';
    outNamesRef.current  = session.outputNames?.length
      ? session.outputNames
      : Object.keys(session.outputMetadata ?? {});

    // Warmup with the correct shape
    const warm = new ort.Tensor('float32', new Float32Array(ringRef.current.data.length), [1, ringRef.current.data.length]);
    try { await session.run({ [inputNameRef.current]: warm }); } catch {}

    setError(null);
  }, [chooseExecutionProvider]);

  /* --------------------------- start/stop ---------------------------- */
  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;

    try { if (procRef.current?.port) procRef.current.port.onmessage = null; } catch {}
    try { procRef.current?.port?.postMessage('flush'); } catch {}
    try { procRef.current?.disconnect(); } catch {}
    procRef.current = null;

    if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null; }
    if (ctxRef.current)    { ctxRef.current.close(); ctxRef.current = null; }

    setIsReady(false);
    setPitch(null); setConfidence(0);
    smoothRef.current.length = 0;
    lastEmit.current.hz = null;
    gateActiveRef.current = false;
  }, []);

  const start = useCallback(async () => {
    if (!enabled) return;

    const ac = new AbortController();
    abortRef.current = ac;
    const { signal } = ac;

    try {
      if (!sessionRef.current) await setupSession(modelDir);

      ctxRef.current = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 48000 });
      await ctxRef.current.audioWorklet.addModule('/audio-processor.js').catch(()=>{});
      if (ctxRef.current.state === 'suspended') await ctxRef.current.resume();

      streamRef.current = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 48000,
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false
        },
        signal
      });
      const mic = ctxRef.current.createMediaStreamSource(streamRef.current);

      const deviceSR = ctxRef.current.sampleRate || 48000;
      const targetSR = targetSrRef.current;
      const minBuf   = (deviceSR / targetSR) * 256;
      let bufferSize = 1024; while (bufferSize < minBuf) bufferSize *= 2;
      if (bufferSize < 1024) bufferSize = 1024;

      procRef.current = new AudioWorkletNode(
        ctxRef.current,
        'audio-processor',
        { processorOptions: { bufferSize } },
      );

      procRef.current.port.onmessage = (ev) => {
        const ctx = ctxRef.current; if (!ctx) return;

        let data = ev.data;
        if (data instanceof ArrayBuffer) {
          data = new Float32Array(data);
        } else if (!(data instanceof Float32Array) && data?.buffer instanceof ArrayBuffer) {
          try {
            data = new Float32Array(data.buffer, data.byteOffset || 0, (data.byteLength || data.buffer.byteLength) / 4);
          } catch {
            data = new Float32Array(data.buffer);
          }
        }
        if (!(data instanceof Float32Array) || !data.length) return;

        pushAudio(data, deviceSR);

        const now = performance.now();
        if (now - lastEmit.current.t >= MIN_INTERVAL) {
          lastEmit.current.t = now;
          inferLatest(); // fire-and-forget
        }
      };

      mic.connect(procRef.current);
      setError(null);
      setIsReady(true);
    } catch (e) {
      if (e.name !== 'AbortError') setError(e.message || String(e));
      stop();
    }
  }, [enabled, modelDir, MIN_INTERVAL, pushAudio, inferLatest, setupSession, stop]);

  useEffect(() => {
    if (!enabled) { stop(); return () => {}; }
    const id = setTimeout(start, 50);
    return () => { clearTimeout(id); stop(); };
  }, [enabled, start, stop]);

  return { pitch, confidence, isReady, error };
}
