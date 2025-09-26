// hooks/vision/useHandBeat.ts
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { HandLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";

/**
 * Very light, conductor-style beat detector:
 *  - Tracks index fingertip (landmark 8) Y position (0..1; down is +)
 *  - Requires a recent downward motion, then triggers on sharp upward velocity
 *  - Adds a refractory to avoid double-fires
 *  - Subtracts a configurable latency to compensate client compute delays
 */
type Opts = {
  latencyMs?: number;     // subtract from timestamps (user-calibrated)
  upVelThresh?: number;   // normalized units/sec; larger = stricter
  downVelThresh?: number; // negative
  refractoryMs?: number;
  primeWindowMs?: number; // "recent downward" window length
};

export default function useHandBeat(opts: Opts = {}) {
  const {
    latencyMs = 90,
    upVelThresh = 1.2,
    downVelThresh = -0.8,
    refractoryMs = 180,
    primeWindowMs = 240,
  } = opts;

  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasCamera, setHasCamera] = useState(false);

  const lmRef = useRef<HandLandmarker | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // loop ids (either VFC or RAF)
  const vfcIdRef = useRef<number | null>(null);
  const rafIdRef = useRef<number | null>(null);

  // timing + events
  const anchorMsRef = useRef<number | null>(null);
  const eventsSecRef = useRef<number[]>([]);

  // motion state
  const lastYRef = useRef<number | null>(null);
  const lastTRef = useRef<number | null>(null);
  const lastDownMsRef = useRef<number | null>(null);
  const lastFireMsRef = useRef<number | null>(null);

  /** Cancel any scheduled frame callbacks */
  const cancelFrameCallbacks = () => {
    try {
      const v = videoRef.current as any;
      if (v && typeof v.cancelVideoFrameCallback === "function" && vfcIdRef.current != null) {
        v.cancelVideoFrameCallback(vfcIdRef.current);
      }
    } catch {}
    if (rafIdRef.current != null) cancelAnimationFrame(rafIdRef.current);
    vfcIdRef.current = null;
    rafIdRef.current = null;
  };

  /** Stop camera + clear state */
  const stopCamera = useCallback(() => {
    cancelFrameCallbacks();
    if (videoRef.current) {
      try { videoRef.current.srcObject = null; } catch {}
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    lastYRef.current = null;
    lastTRef.current = null;
    setHasCamera(false);
    setReady(false);
  }, []);

  /** Muffle TFLite INFO spam that’s printed via console.error inside tasks-vision */
  const muffleTfLiteInfoOnce = () => {
    const original = console.error;
    let restored = false;

    const isNoisyTflite = (first: unknown) => {
      if (typeof first !== "string") return false;
      // Known noisy lines from TFLite backends (XNNPACK/GPU/etc.)
      return /^INFO:\s+Created TensorFlow Lite .* delegate/i.test(first)
          || /^INFO:\s+Metal delegate/i.test(first)
          || /^INFO:\s+WebNN delegate/i.test(first);
    };

    console.error = (...args: any[]) => {
      if (isNoisyTflite(args[0])) return;
      return (original as any)(...args);
    };

    // restore after a few seconds or on demand
    const restore = () => {
      if (!restored) {
        console.error = original;
        restored = true;
      }
    };
    setTimeout(restore, 4000);
    return restore;
  };

  /** Ensure landmarker is created with VIDEO mode */
  const ensureLandmarker = useCallback(async () => {
    if (lmRef.current) return;
    let restoreConsole: (() => void) | null = null;
    try {
      // Silence the “Created TensorFlow Lite XNNPACK delegate for CPU.” console.error noise
      restoreConsole = muffleTfLiteInfoOnce();

      const fileset = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm"
      );
      lmRef.current = await HandLandmarker.createFromOptions(fileset, {
        baseOptions: {
          modelAssetPath:
            "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task",
        },
        runningMode: "VIDEO",
        numHands: 1,
        minTrackingConfidence: 0.5,
        minHandPresenceConfidence: 0.5,
      });
    } catch (e) {
      setError((e as any)?.message || String(e));
    } finally {
      try { restoreConsole?.(); } catch {}
    }
  }, []);

  /** wait for video metadata and non-zero intrinsic dimensions */
  const waitForVideoReady = async (video: HTMLVideoElement) => {
    if (video.readyState < HTMLMediaElement.HAVE_METADATA) {
      await new Promise<void>((res) =>
        video.addEventListener("loadedmetadata", () => res(), { once: true })
      );
    }
    // wait until we get non-zero intrinsic dimensions
    const t0 = performance.now();
    while ((!video.videoWidth || !video.videoHeight) && performance.now() - t0 < 5000) {
      await new Promise((r) => requestAnimationFrame(() => r(null)));
    }
    if (!video.videoWidth || !video.videoHeight) {
      throw new Error("Camera stream has zero dimensions.");
    }
  };

  /** Start capturing and detection; anchorMs is an external time zero */
  const start = useCallback(
    async (anchorMs: number) => {
      setError(null);
      await ensureLandmarker();
      if (!lmRef.current) return;

      anchorMsRef.current = anchorMs;
      eventsSecRef.current = [];
      lastDownMsRef.current = null;
      lastFireMsRef.current = null;

      // prepare hidden video element
      if (!videoRef.current) {
        const v = document.createElement("video");
        v.playsInline = true;
        v.muted = true;
        v.autoplay = true;
        v.width = 320;
        v.height = 240;
        v.style.position = "fixed";
        v.style.left = "-9999px";
        v.style.top = "-9999px";
        v.setAttribute("data-usehandbeat", "camera");
        document.body.appendChild(v);
        videoRef.current = v;
      }

      // get camera
      try {
        streamRef.current = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 60 } },
          audio: false,
        });
        const v = videoRef.current!;
        v.srcObject = streamRef.current;
        await v.play();
        await waitForVideoReady(v);
        setHasCamera(true);
        setReady(true);

        // handle track end
        const [track] = streamRef.current.getVideoTracks();
        track.onended = () => {
          setError("Camera track ended.");
          stopCamera();
        };
      } catch (e) {
        setError((e as any)?.message || String(e));
        setHasCamera(false);
        return;
      }

      const v = videoRef.current!;
      const lm = lmRef.current!;

      // main loop using requestVideoFrameCallback when available
      let canceled = false;

      const tickVFC = (_now: number, _meta: any) => {
        if (canceled) return;
        const w = v.videoWidth | 0;
        const h = v.videoHeight | 0;

        // guard: skip frames with zero-sized input (prevents ROI/WebGL errors)
        if (!w || !h) {
          (v as any).requestVideoFrameCallback && (vfcIdRef.current = (v as any).requestVideoFrameCallback(tickVFC));
          return;
        }

        try {
          const ts = performance.now();
          const res = lm.detectForVideo(v, ts);
          const landmarks = res?.landmarks?.[0];

          if (landmarks && landmarks.length >= 9) {
            const y = landmarks[8].y; // index fingertip
            const t = ts;
            const yPrev = lastYRef.current;
            const tPrev = lastTRef.current;

            if (yPrev != null && tPrev != null) {
              const dt = Math.max(1, t - tPrev) / 1000;
              const vy = (yPrev - y) / dt; // up = positive (y grows downward)

              if (vy < downVelThresh) lastDownMsRef.current = ts;

              const recentlyPrimed =
                lastDownMsRef.current != null && ts - lastDownMsRef.current <= primeWindowMs;
              const cooled =
                lastFireMsRef.current == null || ts - lastFireMsRef.current >= refractoryMs;

              if (recentlyPrimed && cooled && vy > upVelThresh) {
                lastFireMsRef.current = ts;
                const base = anchorMsRef.current ?? performance.now();
                const tSec = Math.max(0, (ts - base - latencyMs) / 1000);
                eventsSecRef.current.push(tSec);
              }
            }
            lastYRef.current = y;
            lastTRef.current = t;
          }
        } catch {
          // swallow transient graph errors and keep the loop alive
        }

        (v as any).requestVideoFrameCallback && (vfcIdRef.current = (v as any).requestVideoFrameCallback(tickVFC));
      };

      const tickRAF = () => {
        if (canceled) return;
        const w = v.videoWidth | 0;
        const h = v.videoHeight | 0;

        if (w && h) {
          try {
            const ts = performance.now();
            const res = lm.detectForVideo(v, ts);
            const landmarks = res?.landmarks?.[0];

            if (landmarks && landmarks.length >= 9) {
              const y = landmarks[8].y;
              const t = ts;
              const yPrev = lastYRef.current;
              const tPrev = lastTRef.current;

              if (yPrev != null && tPrev != null) {
                const dt = Math.max(1, t - tPrev) / 1000;
                const vy = (yPrev - y) / dt;

                if (vy < downVelThresh) lastDownMsRef.current = ts;

                const recentlyPrimed =
                  lastDownMsRef.current != null && ts - lastDownMsRef.current <= primeWindowMs;
                const cooled =
                  lastFireMsRef.current == null || ts - lastFireMsRef.current >= refractoryMs;

                if (recentlyPrimed && cooled && vy > upVelThresh) {
                  lastFireMsRef.current = ts;
                  const base = anchorMsRef.current ?? performance.now();
                  const tSec = Math.max(0, (ts - base - latencyMs) / 1000);
                  eventsSecRef.current.push(tSec);
                }
              }
              lastYRef.current = y;
              lastTRef.current = t;
            }
          } catch {}
        }

        rafIdRef.current = requestAnimationFrame(tickRAF);
      };

      // choose loop impl
      cancelFrameCallbacks();
      const hasVFC = typeof (v as any).requestVideoFrameCallback === "function";
      if (hasVFC) {
        vfcIdRef.current = (v as any).requestVideoFrameCallback(tickVFC);
      } else {
        rafIdRef.current = requestAnimationFrame(tickRAF);
      }

      return () => {
        canceled = true;
      };
    },
    [ensureLandmarker, latencyMs, primeWindowMs, refractoryMs, upVelThresh, downVelThresh]
  );

  const stop = useCallback(() => {
    stopCamera();
  }, [stopCamera]);

  const snapshotEvents = useCallback(() => {
    return eventsSecRef.current.slice();
  }, []);

  useEffect(() => {
    return () => {
      stopCamera();
      if (videoRef.current) {
        try { videoRef.current.remove(); } catch {}
      }
      if (lmRef.current) {
        try { lmRef.current.close(); } catch {}
      }
      lmRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    ready,
    error,
    hasCamera,
    start,
    stop,
    snapshotEvents,
  };
}
