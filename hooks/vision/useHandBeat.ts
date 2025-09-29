// hooks/vision/useHandBeat.ts
import { useCallback, useEffect, useRef, useState } from "react";
import {
  HandLandmarker,
  HandLandmarkerResult,
} from "@mediapipe/tasks-vision";

/**
 * Runtime paths (served from /public).
 * Make sure these files exist in your app:
 *  - /public/models/mediapie/wasm/vision_wasm_internal.{js,wasm}
 *  - /public/models/mediapie/models/hand_landmarker_v0.4.0.task
 */
const WASM_BASE = "/models/mediapie/wasm";
const WASM_LOADER = `${WASM_BASE}/vision_wasm_internal.js`;
const WASM_BINARY = `${WASM_BASE}/vision_wasm_internal.wasm`;
const HAND_MODEL = "/models/mediapie/models/hand_landmarker_v0.4.0.task";

export type UseHandBeatOptions = {
  /** Compensate end-to-end gesture latency (ms). Subtracted from event timestamps. */
  latencyMs?: number;
  /** Ignore per-frame jitter smaller than this |dy| (normalized units). */
  noiseEps?: number;
  /** Minimum upward speed (normalized units/sec). */
  minUpVel?: number;
  /** Upward travel needed to arm a strike. */
  fireUpEps?: number;
  /** Extra upward travel needed (>= fireUpEps) before we confirm at reversal. */
  confirmUpEps?: number;
  /** Downward travel required after a strike to re-arm. */
  downRearmEps?: number;
  /** Ignore extra strikes for this long after one fires. */
  refractoryMs?: number;
  /** How many hands to track (1 for perf). */
  numHands?: number;
  /** Optional callback on each detected beat (ms, perf.now clock, latency-compensated). */
  onBeat?: (tMs: number) => void;
};

type UseHandBeatReturn = {
  /** Load the model (idempotent). */
  preload: () => Promise<void>;
  /** Start camera + loop; optional anchor (ms) for time zero. */
  start: (anchorMs?: number) => Promise<void>;
  /** Stop camera + loop. */
  stop: () => void;
  /** Clear state and set new anchor (defaults to now). */
  reset: (anchorMs?: number) => void;
  /** Return gesture onsets (seconds) relative to last anchor. */
  snapshotEvents: () => number[];
  isReady: boolean;
  isRunning: boolean;
  error: string | null;
};

export default function useHandBeat({
  latencyMs = 90,
  noiseEps = 0.0015,
  minUpVel = 0.35,
  fireUpEps = 0.004,
  confirmUpEps = 0.012,
  downRearmEps = 0.006,
  refractoryMs = 90,
  numHands = 1,
  onBeat,
}: UseHandBeatOptions = {}): UseHandBeatReturn {
  const landmarkerRef = useRef<HandLandmarker | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);

  // Motion state
  const lastYRef = useRef<number | null>(null);
  const lastTsRef = useRef<number | null>(null);
  const lastVyRef = useRef<number>(0); // units/sec
  const upAccumRef = useRef<number>(0);
  const downAccumRef = useRef<number>(0);
  const armedRef = useRef<boolean>(true);
  const primedRef = useRef<boolean>(false);
  const lastBeatAtRef = useRef<number>(-1e9);

  // Timing & events
  const anchorMsRef = useRef<number>(performance.now());
  const eventsMsRef = useRef<number[]>([]);

  // UI state
  const [isReady, setIsReady] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ensureVideo = () => {
    if (!videoRef.current) {
      const v = document.createElement("video");
      v.playsInline = true;
      v.muted = true;
      v.autoplay = false;
      videoRef.current = v;
    }
    return videoRef.current!;
  };

  const preload = useCallback(async () => {
    if (landmarkerRef.current) return;

    try {
      // Use the new WasmFileset signature (matches the types you’re seeing).
      const lm = await HandLandmarker.createFromOptions(
        { wasmLoaderPath: WASM_LOADER, wasmBinaryPath: WASM_BINARY },
        {
          baseOptions: { modelAssetPath: HAND_MODEL, delegate: "GPU" },
          runningMode: "VIDEO",
          numHands,
        }
      );
      landmarkerRef.current = lm;
      setIsReady(true);
    } catch (e: any) {
      setError(e?.message ?? String(e));
      throw e;
    }
  }, [numHands]);

  const reset = useCallback((anchorMs?: number) => {
    anchorMsRef.current = anchorMs ?? performance.now();
    lastYRef.current = null;
    lastTsRef.current = null;
    lastVyRef.current = 0;
    upAccumRef.current = 0;
    downAccumRef.current = 0;
    armedRef.current = true;
    primedRef.current = false;
    eventsMsRef.current = [];
  }, []);

  const stop = useCallback(() => {
    setIsRunning(false);
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const loop = useCallback(() => {
    rafRef.current = requestAnimationFrame(loop);
    const landmarker = landmarkerRef.current;
    const video = videoRef.current;
    if (!landmarker || !video || !video.videoWidth || !video.videoHeight) return;

    try {
      const tsNow = performance.now();
      const res = landmarker.detectForVideo(video, tsNow) as HandLandmarkerResult;
      const first = res?.landmarks?.[0];
      if (!first?.length) return;

      const y = first[0].y; // wrist landmark (index 0)
      const lastY = lastYRef.current;
      const lastTs = lastTsRef.current;

      if (lastY == null || lastTs == null) {
        lastYRef.current = y;
        lastTsRef.current = tsNow;
        lastVyRef.current = 0;
        return;
      }

      const dt = Math.max(1e-6, Math.min(0.2, (tsNow - lastTs) / 1000)); // clamp [~120fps..5fps]
      let dy = y - lastY;                   // +down, -up
      let vy = dy / dt;                     // units/sec

      // noise gate
      if (Math.abs(dy) < noiseEps) dy = 0;

      // accumulators
      if (dy < 0) {                         // moving up
        upAccumRef.current += -dy;
        downAccumRef.current = 0;
      } else if (dy > 0) {                  // moving down
        downAccumRef.current += dy;
      }

      // detect reversal
      const prevVy = lastVyRef.current;
      const reversed = prevVy < 0 && vy >= 0;   // up -> non-up
      const gated = tsNow - lastBeatAtRef.current >= refractoryMs;

      if (armedRef.current) {
        const fastEnough = -vy >= minUpVel;
        if (!primedRef.current && upAccumRef.current >= fireUpEps && fastEnough) {
          primedRef.current = true;
        }
        const confirmOK = upAccumRef.current >= confirmUpEps;

        if (primedRef.current && confirmOK && reversed && gated) {
          const tMs = tsNow - latencyMs;
          lastBeatAtRef.current = tMs;
          eventsMsRef.current.push(tMs);
          onBeat?.(tMs);

          armedRef.current = false;
          primedRef.current = false;
          upAccumRef.current = 0;
          downAccumRef.current = 0;
        }
      } else {
        if (downAccumRef.current >= downRearmEps) {
          armedRef.current = true;
          primedRef.current = false;
          upAccumRef.current = 0;
          downAccumRef.current = 0;
        }
      }

      lastYRef.current = y;
      lastTsRef.current = tsNow;
      lastVyRef.current = vy;
    } catch (e: any) {
      setError(e?.message ?? String(e));
    }
  }, [latencyMs, noiseEps, minUpVel, fireUpEps, confirmUpEps, downRearmEps, refractoryMs, onBeat]);

  const start = useCallback(async (anchorMs?: number) => {
    await preload();
    if (typeof anchorMs === "number") anchorMsRef.current = anchorMs;

    const video = ensureVideo();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user" },
        audio: false,
      });
      streamRef.current = stream;
      video.srcObject = stream;
      await video.play();
    } catch (e: any) {
      setError(e?.message ?? String(e));
      throw e;
    }

    setIsRunning(true);
    rafRef.current = requestAnimationFrame(loop);
  }, [preload, loop]);

  const snapshotEvents = useCallback((): number[] => {
    const anchor = anchorMsRef.current;
    return eventsMsRef.current
      .map((t) => (t - anchor) / 1000)
      .filter((s) => Number.isFinite(s));
  }, []);

  useEffect(() => {
    return () => {
      try {
        stop();
      } finally {
        landmarkerRef.current?.close();
        landmarkerRef.current = null;
      }
    };
  }, [stop]);

  return {
    preload,
    start,
    stop,
    reset,
    snapshotEvents,
    isReady,
    isRunning,
    error,
  };
}
