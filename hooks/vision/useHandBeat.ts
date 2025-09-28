// hooks/vision/useHandBeat.ts
"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { HandLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";

/**
 * Gameplay detector (two-stage + velocity gate):
 * - EARLY when cumulative upward >= fireUpEps AND instantaneous upVel >= minUpVel → capture tFirst (latency-compensated)
 * - CONFIRM when cumulative upward >= confirmUpEps → commit using tFirst
 * - Cooldown then re-arm on downRearmEps
 * - Fingertip-only; every frame; tiny deadband
 */
type Opts = {
  latencyMs?: number;
  fireUpEps?: number;     // default 0.004
  confirmUpEps?: number;  // default 0.012 (> fireUpEps)
  downRearmEps?: number;  // default 0.006
  refractoryMs?: number;  // default 90
  noiseEps?: number;      // default 0.0015
  minUpVel?: number;      // default 0.35 (norm units / sec)
};

export default function useHandBeat(opts: Opts = {}) {
  const {
    latencyMs = 90,
    fireUpEps = 0.004,
    confirmUpEps = 0.012,
    downRearmEps = 0.006,
    refractoryMs = 90,
    noiseEps = 0.0015,
    minUpVel = 0.35,
  } = opts;

  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasCamera, setHasCamera] = useState(false);

  const lmRef = useRef<HandLandmarker | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const vfcIdRef = useRef<number | null>(null);
  const rafIdRef = useRef<number | null>(null);

  const anchorMsRef = useRef<number | null>(null);
  const eventsSecRef = useRef<number[]>([]);

  // fingertip state
  const lastYRef = useRef<number | null>(null);
  const lastTsRef = useRef<number | null>(null);
  const cumUpRef = useRef(0);
  const cumDownRef = useRef(0);
  const armedRef = useRef(true);
  const lastFireMsRef = useRef<number | null>(null);
  const pendingFirstMsRef = useRef<number | null>(null); // EARLY timestamp

  const cancelFrameCallbacks = () => {
    try {
      const v = videoRef.current as any;
      if (v && typeof v.cancelVideoFrameCallback === "function" && vfcIdRef.current != null) {
        v.cancelVideoFrameCallback(vfcIdRef.current);
      }
    } catch {}
    if (rafIdRef.current != null) cancelAnimationFrame(rafIdRef.current);
    vfcIdRef.current = null; // ✅ correct: mutate .current, don’t reassign the ref
    rafIdRef.current = null; // ✅
  };

  // Reset internal timing/counters WITHOUT touching the camera
  const reset = useCallback((anchorMs?: number) => {
    anchorMsRef.current = typeof anchorMs === "number" ? anchorMs : performance.now();
    eventsSecRef.current = [];
    lastYRef.current = null;
    lastTsRef.current = null;
    cumUpRef.current = 0;
    cumDownRef.current = 0;
    armedRef.current = true;
    lastFireMsRef.current = null;
    pendingFirstMsRef.current = null;
  }, []);

  const stopCamera = useCallback(() => {
    cancelFrameCallbacks();
    if (videoRef.current) {
      try { (videoRef.current as HTMLVideoElement).srcObject = null; } catch {}
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setHasCamera(false);
    setReady(false);
  }, []);

  // Pause detection loop but keep the stream alive
  const pause = useCallback(() => {
    cancelFrameCallbacks();
    // keep hasCamera/ready as-is so UI doesn’t flicker
  }, []);

  const muffleTfLiteInfoOnce = () => {
    const original = console.error;
    let restored = false;
    const isNoisy = (s: unknown) =>
      typeof s === "string" &&
      /^INFO:\s+Created TensorFlow Lite .* delegate|^INFO:\s+Metal delegate|^INFO:\s+WebNN delegate/i.test(s);
    console.error = (...args: any[]) => {
      if (isNoisy(args[0])) return;
      return (original as any)(...args);
    };
    const restore = () => { if (!restored) { console.error = original; restored = true; } };
    setTimeout(restore, 3500);
    return restore;
  };

  const ensureLandmarker = useCallback(async () => {
    if (lmRef.current) return;
    let restoreConsole: (() => void) | null = null;
    try {
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
        minTrackingConfidence: 0.25,
        minHandPresenceConfidence: 0.25,
      });
    } catch (e) {
      setError((e as any)?.message || String(e));
    } finally {
      try { restoreConsole?.(); } catch {}
    }
  }, []);

  const waitForVideoReady = async (video: HTMLVideoElement) => {
    if (video.readyState < HTMLMediaElement.HAVE_METADATA) {
      await new Promise<void>((res) =>
        video.addEventListener("loadedmetadata", () => res(), { once: true })
      );
    }
    const t0 = performance.now();
    while ((!video.videoWidth || !video.videoHeight) && performance.now() - t0 < 5000) {
      await new Promise((r) => requestAnimationFrame(() => r(null)));
    }
    if (!video.videoWidth || !video.videoHeight) {
      throw new Error("Camera stream has zero dimensions.");
    }
  };

  const start = useCallback(
    async (anchorMs?: number) => {
      setError(null);
      await ensureLandmarker();
      if (!lmRef.current) return;

      // ensure hidden <video> exists
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

      // Idempotent: reuse existing stream if we have one; otherwise request it
      if (!streamRef.current) {
        try {
          streamRef.current = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 30 } },
            audio: false,
          });
          const v = videoRef.current!;
          v.srcObject = streamRef.current;
          await v.play();
          await waitForVideoReady(v);
          setHasCamera(true);
          setReady(true);
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
      } else {
        const v = videoRef.current!;
        if (v.srcObject !== streamRef.current) v.srcObject = streamRef.current;
        try { await v.play(); } catch {}
        setHasCamera(true);
        setReady(true);
      }

      // Optional anchor reset on (re)start
      if (typeof anchorMs === "number") reset(anchorMs);

      // (Re)start the detection loop fresh
      const v = videoRef.current!;
      const lm = lmRef.current!;
      cancelFrameCallbacks();

      let canceled = false;

      const runOnce = () => {
        if (canceled) return;
        const w = v.videoWidth | 0;
        const h = v.videoHeight | 0;
        if (!w || !h) return;

        try {
          const ts = performance.now();
          const res = lm.detectForVideo(v, ts);
          const landmarks = res?.landmarks?.[0];

          if (landmarks && landmarks.length >= 9) {
            const tip = landmarks[8]!;
            const y = tip.y;
            const prevY = lastYRef.current;
            const prevTs = lastTsRef.current;

            if (prevY == null || prevTs == null) {
              lastYRef.current = y;
              lastTsRef.current = ts;
            } else {
              let dy = prevY - y; // >0 up, <0 down
              if (Math.abs(dy) < noiseEps) dy = 0;

              const dtSec = Math.min(0.1, Math.max(1 / 240, (ts - prevTs) / 1000));
              const upVel = dy > 0 ? dy / dtSec : 0;

              const lastFire = lastFireMsRef.current;
              const cooling = lastFire != null && ts - lastFire < refractoryMs;

              if (dy > 0) {
                cumUpRef.current += dy;
                cumDownRef.current = 0;

                if (armedRef.current && !cooling) {
                  // EARLY must be both distance and velocity
                  if (pendingFirstMsRef.current == null && cumUpRef.current >= fireUpEps && upVel >= minUpVel) {
                    pendingFirstMsRef.current = ts; // early timestamp
                  }
                  // CONFIRM on distance
                  if (pendingFirstMsRef.current != null && cumUpRef.current >= confirmUpEps) {
                    const tFirstMs = pendingFirstMsRef.current;
                    pendingFirstMsRef.current = null;
                    lastFireMsRef.current = ts;
                    armedRef.current = false;

                    const base = anchorMsRef.current ?? performance.now();
                    const tSec = Math.max(0, (tFirstMs - base - latencyMs) / 1000);
                    eventsSecRef.current.push(tSec);

                    cumUpRef.current = 0;
                    cumDownRef.current = 0;
                  }
                }
              } else if (dy < 0) {
                cumDownRef.current += -dy;
                cumUpRef.current = 0;
                pendingFirstMsRef.current = null;

                if (!armedRef.current && !cooling && cumDownRef.current >= downRearmEps) {
                  armedRef.current = true;
                  cumDownRef.current = 0;
                }
              }

              lastYRef.current = y;
              lastTsRef.current = ts;
            }
          }
        } catch {}
      };

      const hasVFC = typeof (v as any).requestVideoFrameCallback === "function";
      if (hasVFC) {
        const tickVFC = () => {
          runOnce();
          (v as any).requestVideoFrameCallback &&
            (vfcIdRef.current = (v as any).requestVideoFrameCallback(tickVFC));
        };
        vfcIdRef.current = (v as any).requestVideoFrameCallback(tickVFC);
      } else {
        const tickRAF = () => {
          runOnce();
          rafIdRef.current = requestAnimationFrame(tickRAF);
        };
        rafIdRef.current = requestAnimationFrame(tickRAF);
      }

      return () => { canceled = true; };
    },
    [ensureLandmarker, latencyMs, fireUpEps, confirmUpEps, downRearmEps, refractoryMs, noiseEps, minUpVel, stopCamera, reset]
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
  }, [stopCamera]);

  return {
    ready,
    error,
    hasCamera,
    start,       // boots model+camera if needed; restarts loop
    pause,       // stop loop, keep camera alive
    stop,        // full teardown (end of session/unmount)
    reset,       // per-take re-anchor & clear events
    snapshotEvents,
  };
}
