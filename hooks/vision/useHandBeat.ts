// hooks/vision/useHandBeat.ts
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { HandLandmarker } from "@mediapipe/tasks-vision";

/**
 * Runtime paths (served from /public) — match VisionStage/useHandLandmarker.
 * Ensure these exist:
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
  /** Per-frame |dy| below this is ignored (normalized units). */
  noiseEps?: number;
  /** Minimal instantaneous upward velocity (norm units/sec) to allow EARLY capture. */
  minUpVel?: number;
  /** Upward travel to arm early detection. */
  fireUpEps?: number;
  /** Extra upward travel (>= fireUpEps) to confirm; event uses EARLY time. */
  confirmUpEps?: number;
  /** Downward travel to re-arm after a strike. */
  downRearmEps?: number;
  /** Cooldown after a strike (ms). */
  refractoryMs?: number;
  /** How many hands to ask the model for (1 for perf). */
  numHands?: number;
  /** Optional callback on each detected beat (ms, perf.now clock, latency-compensated). */
  onBeat?: (tMs: number) => void;
};

type UseHandBeatReturn = {
  /** Preload the hand model (idempotent). */
  preload: () => Promise<void>;
  /** Start camera + detection loop; optional anchor (ms) for time zero. */
  start: (anchorMs?: number) => Promise<void>;
  /** Stop camera + loop, release resources. */
  stop: () => void;
  /** Clear state and set a new anchor (defaults to now). */
  reset: (anchorMs?: number) => void;
  /** Return gesture onsets (seconds) relative to last anchor. */
  snapshotEvents: () => number[];
  isReady: boolean;
  isRunning: boolean;
  error: string | null;
};

/**
 * Finger-tap beat detector (index fingertip only) — parity with VisionStage:
 * - EARLY: cumulative upward delta >= fireUpEps AND upVel >= minUpVel → capture tFirst
 * - CONFIRM: cumUp >= confirmUpEps → commit event using tFirst (we subtract latencyMs here)
 * - Re-arm: downward cum >= downRearmEps after refractoryMs
 * - Every frame; tiny deadband; requestVideoFrameCallback when available
 */
export default function useHandBeat({
  latencyMs = 50,
  noiseEps = 0.0015,
  minUpVel = 0.1,
  fireUpEps = 0.004,
  confirmUpEps = 0.012,
  downRearmEps = 0.006,
  refractoryMs = 10,
  numHands = 1,
  onBeat,
}: UseHandBeatOptions = {}): UseHandBeatReturn {
  const landmarkerRef = useRef<HandLandmarker | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const vfcIdRef = useRef<number | null>(null);

  // Fingertip state (index tip = 8)
  const lastYRef = useRef<number | null>(null);
  const lastTsRef = useRef<number | null>(null);
  const cumUpRef = useRef(0);
  const cumDownRef = useRef(0);
  const armedRef = useRef(true);
  const lastFireMsRef = useRef<number | null>(null);

  // Two-stage timing (we commit with tFirst)
  const pendingFirstMsRef = useRef<number | null>(null);

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
      const lm = await HandLandmarker.createFromOptions(
        { wasmLoaderPath: WASM_LOADER, wasmBinaryPath: WASM_BINARY },
        {
          baseOptions: { modelAssetPath: HAND_MODEL, delegate: "GPU" },
          runningMode: "VIDEO",
          numHands,
          // Parity with VisionStage
          minTrackingConfidence: 0.25,
          minHandPresenceConfidence: 0.25,
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
    cumUpRef.current = 0;
    cumDownRef.current = 0;
    armedRef.current = true;
    lastFireMsRef.current = null;
    pendingFirstMsRef.current = null;
    eventsMsRef.current = [];
  }, []);

  const stop = useCallback(() => {
    setIsRunning(false);
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (vfcIdRef.current != null) {
      try {
        const v: any = videoRef.current;
        if (v && typeof v.cancelVideoFrameCallback === "function") {
          v.cancelVideoFrameCallback(vfcIdRef.current);
        }
      } catch {}
      vfcIdRef.current = null;
    }
    try { streamRef.current?.getTracks().forEach((t) => t.stop()); } catch {}
    streamRef.current = null;
  }, []);

  const processFrame = useCallback(() => {
    const landmarker = landmarkerRef.current;
    const video = videoRef.current;
    if (!landmarker || !video || !video.videoWidth || !video.videoHeight) return;

    try {
      const ts = performance.now();
      const res = landmarker.detectForVideo(video, ts);
      const lms = (res as any)?.landmarks?.[0] as Array<{ x: number; y: number }> | undefined;
      if (!lms || lms.length < 9) return;

      // Index fingertip (8) — upward is decreasing y, so dyUp = prevY - y
      const y = lms[8]!.y;

      const prevY = lastYRef.current;
      const prevTs = lastTsRef.current;

      if (prevY == null || prevTs == null) {
        lastYRef.current = y;
        lastTsRef.current = ts;
        return;
      }

      let dyUp = prevY - y; // >0 going up, <0 going down
      if (Math.abs(dyUp) < noiseEps) dyUp = 0;

      // dt in seconds; guard extremes (parity with VisionStage)
      const dtSec = Math.min(0.1, Math.max(1 / 240, (ts - prevTs) / 1000));
      const upVel = dyUp > 0 ? dyUp / dtSec : 0;

      const lastFire = lastFireMsRef.current;
      const cooling = lastFire != null && ts - lastFire < refractoryMs;

      if (dyUp > 0) {
        // Moving UP
        cumUpRef.current += dyUp;
        cumDownRef.current = 0;

        if (armedRef.current && !cooling) {
          // EARLY: need distance AND minimal instantaneous upward velocity
          if (
            pendingFirstMsRef.current == null &&
            cumUpRef.current >= fireUpEps &&
            upVel >= minUpVel
          ) {
            pendingFirstMsRef.current = ts; // capture early time
          }

          // CONFIRM: more distance; commit using EARLY time
          if (
            pendingFirstMsRef.current != null &&
            cumUpRef.current >= confirmUpEps
          ) {
            const tFirstMs = pendingFirstMsRef.current!;
            pendingFirstMsRef.current = null;
            lastFireMsRef.current = ts;
            armedRef.current = false;

            // Latency compensation only here (diff vs VisionStage)
            const tMs = tFirstMs - (latencyMs ?? 0);
            eventsMsRef.current.push(tMs);
            try { onBeat?.(tMs); } catch {}

            // Reset accumulators after a strike
            cumUpRef.current = 0;
            cumDownRef.current = 0;
          }
        }
      } else if (dyUp < 0) {
        // Moving DOWN
        cumDownRef.current += -dyUp;
        cumUpRef.current = 0;
        // Cancel EARLY if user bailed
        pendingFirstMsRef.current = null;

        if (!armedRef.current && !cooling && cumDownRef.current >= downRearmEps) {
          armedRef.current = true;
          cumDownRef.current = 0;
        }
      } else {
        // No significant motion
      }

      lastYRef.current = y;
      lastTsRef.current = ts;
    } catch (e: any) {
      setError(e?.message ?? String(e));
    }
  }, [
    latencyMs,
    noiseEps,
    minUpVel,
    fireUpEps,
    confirmUpEps,
    downRearmEps,
    refractoryMs,
    onBeat,
  ]);

  const start = useCallback(async (anchorMs?: number) => {
    await preload();
    if (typeof anchorMs === "number") anchorMsRef.current = anchorMs;

    const video = ensureVideo();
    try {
      // Match VisionStage constraints
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "user",
          width: { ideal: 640 },
          height: { ideal: 480 },
          frameRate: { ideal: 30 },
        },
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

    const v: any = video;
    const hasVFC = typeof v.requestVideoFrameCallback === "function";

    if (hasVFC) {
      const tickVFC = () => {
        processFrame();
        vfcIdRef.current = v.requestVideoFrameCallback(tickVFC);
      };
      vfcIdRef.current = v.requestVideoFrameCallback(tickVFC);
    } else {
      const runLoop = () => {
        processFrame();
        rafRef.current = requestAnimationFrame(runLoop);
      };
      rafRef.current = requestAnimationFrame(runLoop);
    }
  }, [preload, processFrame]);

  const snapshotEvents = useCallback((): number[] => {
    const anchor = anchorMsRef.current;
    return eventsMsRef.current
      .map((t) => (t - anchor) / 1000)
      .filter((s) => Number.isFinite(s));
  }, []);

  useEffect(() => {
    return () => {
      try { stop(); } finally {
        try { landmarkerRef.current?.close(); } catch {}
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
