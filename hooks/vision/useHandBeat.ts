// hooks/vision/useHandBeat.ts
"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { HandLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";
/**
 * Conductor-style beat detector (robust "down → up"):
 * - Tracks fingertip (8) relative to knuckle (5)
 * - Prime on modest down OR tip slightly below knuckle
 * - Fire when velocity turns upward AND we've left the local max (the bottom)
 * - Refractory prevents double-fires
 * - Subtracts calibrated latency from timestamps (for gameplay)
 */
type Opts = {
  latencyMs?: number;
  upVelThresh?: number;
  downVelThresh?: number;
  refractoryMs?: number;
  primeWindowMs?: number;
  primeRelBelow?: number;
  primeDropRelMin?: number;
  leaveMaxEps?: number;
};
export default function useHandBeat(opts: Opts = {}) {
  const {
    latencyMs = 90,
    upVelThresh = 0.50,
    downVelThresh = -0.40,
    refractoryMs = 140,
    primeWindowMs = 600,
    primeRelBelow = 0.012,
    primeDropRelMin = 0.008,
    leaveMaxEps = 0.0035,
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
  // Smoothed state (relative y)
  const lastTRef = useRef<number | null>(null);
  const yRelEmaRef = useRef<number | null>(null);
  const yRelLocalMaxRef = useRef<number | null>(null);
  const lastPrimeMsRef = useRef<number | null>(null);
  const lastFireMsRef = useRef<number | null>(null);
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
        minTrackingConfidence: 0.5,
        minHandPresenceConfidence: 0.5,
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
    async (anchorMs: number) => {
      setError(null);
      await ensureLandmarker();
      if (!lmRef.current) return;
      anchorMsRef.current = anchorMs;
      eventsSecRef.current = [];
      lastTRef.current = null;
      yRelEmaRef.current = null;
      yRelLocalMaxRef.current = null;
      lastPrimeMsRef.current = null;
      lastFireMsRef.current = null;
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
      const v = videoRef.current!;
      const lm = lmRef.current!;
      cancelFrameCallbacks();
      let canceled = false;
      const tickVFC = (_now: number, _meta: any) => {
        if (canceled) return;
        const w = v.videoWidth | 0;
        const h = v.videoHeight | 0;
        if (!w || !h) {
          (v as any).requestVideoFrameCallback &&
            (vfcIdRef.current = (v as any).requestVideoFrameCallback(tickVFC));
          return;
        }
        try {
          const ts = performance.now();
          const res = lm.detectForVideo(v, ts);
          const landmarks = res?.landmarks?.[0];
          if (landmarks && landmarks.length >= 9) {
            const tip = landmarks[8]!;
            const mcp = landmarks[5]!;
            const yRel = tip.y - mcp.y;
            const tPrev = lastTRef.current;
            const dt = Math.max(1, tPrev ? ts - tPrev : 16) / 1000;
            const tau = 0.040;
            const a = 1 - Math.exp(-dt / tau);
            const prevYRelE = yRelEmaRef.current ?? yRel;
            const yRelE = prevYRelE + a * (yRel - prevYRelE);
            const vy = tPrev ? (prevYRelE - yRelE) / dt : 0; // up = +
            yRelEmaRef.current = yRelE;
            lastTRef.current = ts;
            // update local MAX when moving down
            if (vy < 0) {
              if (yRelLocalMaxRef.current == null || yRelE > yRelLocalMaxRef.current) {
                yRelLocalMaxRef.current = yRelE;
              }
            }
            const downByRel = yRelE > primeRelBelow;
            const strongDown = vy < downVelThresh;
            const smallDownDip = (yRelE - prevYRelE) > primeDropRelMin;
            if (downByRel || strongDown || smallDownDip) {
              lastPrimeMsRef.current = ts;
            }
            const recentlyPrimed =
              lastPrimeMsRef.current != null && ts - lastPrimeMsRef.current <= primeWindowMs;
            const cooled =
              lastFireMsRef.current == null || ts - lastFireMsRef.current >= refractoryMs;
            const leftOfMax =
              yRelLocalMaxRef.current == null ? true : (yRelE <= yRelLocalMaxRef.current - leaveMaxEps);
            if (recentlyPrimed && cooled && vy > upVelThresh && leftOfMax) {
              lastFireMsRef.current = ts;
              const base = anchorMsRef.current ?? performance.now();
              const tSec = Math.max(0, (ts - base - latencyMs) / 1000);
              eventsSecRef.current.push(tSec);
              yRelLocalMaxRef.current = yRelE;
            }
          }
        } catch {}
        (v as any).requestVideoFrameCallback &&
          (vfcIdRef.current = (v as any).requestVideoFrameCallback(tickVFC));
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
              const tip = landmarks[8]!;
              const mcp = landmarks[5]!;
              const yRel = tip.y - mcp.y;
              const tPrev = lastTRef.current;
              const dt = Math.max(1, tPrev ? ts - tPrev : 16) / 1000;
              const tau = 0.040;
              const a = 1 - Math.exp(-dt / tau);
              const prevYRelE = yRelEmaRef.current ?? yRel;
              const yRelE = prevYRelE + a * (yRel - prevYRelE);
              const vy = tPrev ? (prevYRelE - yRelE) / dt : 0;
              yRelEmaRef.current = yRelE;
              lastTRef.current = ts;
              if (vy < 0) {
                if (yRelLocalMaxRef.current == null || yRelE > yRelLocalMaxRef.current) {
                  yRelLocalMaxRef.current = yRelE;
                }
              }
              const downByRel = yRelE > primeRelBelow;
              const strongDown = vy < downVelThresh;
              const smallDownDip = (yRelE - prevYRelE) > primeDropRelMin;
              if (downByRel || strongDown || smallDownDip) {
                lastPrimeMsRef.current = ts;
              }
              const recentlyPrimed =
                lastPrimeMsRef.current != null && ts - lastPrimeMsRef.current <= primeWindowMs;
              const cooled =
                lastFireMsRef.current == null || ts - lastFireMsRef.current >= refractoryMs;
              const leftOfMax =
                yRelLocalMaxRef.current == null ? true : (yRelE <= yRelLocalMaxRef.current - leaveMaxEps);
              if (recentlyPrimed && cooled && vy > upVelThresh && leftOfMax) {
                lastFireMsRef.current = ts;
                const base = anchorMsRef.current ?? performance.now();
                const tSec = Math.max(0, (ts - base - latencyMs) / 1000);
                eventsSecRef.current.push(tSec);
                yRelLocalMaxRef.current = yRelE;
              }
            }
          } catch {}
        }
        rafIdRef.current = requestAnimationFrame(tickRAF);
      };
      const hasVFC = typeof (v as any).requestVideoFrameCallback === "function";
      if (hasVFC) {
        vfcIdRef.current = (v as any).requestVideoFrameCallback(tickVFC);
      } else {
        rafIdRef.current = requestAnimationFrame(tickRAF);
      }
      return () => { canceled = true; };
    },
    [
      ensureLandmarker,
      latencyMs,
      upVelThresh,
      downVelThresh,
      refractoryMs,
      primeWindowMs,
      primeRelBelow,
      primeDropRelMin,
      leaveMaxEps,
      stopCamera,
    ]
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
    start,
    stop,
    snapshotEvents,
  };
}