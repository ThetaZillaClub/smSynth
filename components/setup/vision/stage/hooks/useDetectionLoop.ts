"use client";
import { useEffect, useRef, useState } from "react";
import type { HandLandmarker } from "@mediapipe/tasks-vision";

/**
 * Two-stage fingertip flick detection with a fast velocity gate:
 * - EARLY: cumulative upward delta >= fireUpEps AND instantaneous upVel >= minUpVel → capture tFirst
 * - CONFIRM: cumulative upward delta >= confirmUpEps → commit using tFirst (visual pulse happens here)
 * - Re-arm on downward cumulative delta >= downRearmEps after cooldown
 * - No knuckle/velocity thresholds for confirm; we only gate EARLY with minUpVel to kill drift/tremor
 * - Every frame; tiny deadband; fingertip-only (index tip = 8)
 */
export type DetectionConfig = {
  fireUpEps: number;      // early trigger upward cumulative delta (0..1 norm)
  confirmUpEps: number;   // confirmation upward cumulative delta (must be > fireUpEps)
  downRearmEps: number;   // downward cumulative delta to re-arm
  refractoryMs: number;   // cooldown
  noiseEps: number;       // per-frame |dy| below this ignored
  minUpVel: number;       // minimal instantaneous upward velocity (norm units per second) to allow EARLY
};

type Props = {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  landmarkerRef: React.RefObject<HandLandmarker | null>;
  anchorMs: number | null;
  drawSkeleton?: (lms: Array<{ x: number; y: number }>) => void;
  config: DetectionConfig;
  onError?: (msg: string) => void;
  recording?: boolean;
  detectEveryN?: number; // ignored (we process every frame)
  maxEvents?: number;
  drawEnabled?: boolean;
  onBeat?: (tSec: number) => void; // called at CONFIRM with tFirst (early) time
  enabled?: boolean;
};

export default function useDetectionLoop({
  videoRef,
  canvasRef,
  landmarkerRef,
  anchorMs,
  drawSkeleton,
  config,
  onError,
  recording = false,
  detectEveryN,
  maxEvents = 128,
  drawEnabled = true,
  onBeat,
  enabled = true,
}: Props) {
  const eventsSecRef = useRef<number[]>([]);

  // fingertip state
  const lastYRef = useRef<number | null>(null);
  const lastTsRef = useRef<number | null>(null);
  const cumUpRef = useRef(0);
  const cumDownRef = useRef(0);
  const armedRef = useRef(true);
  const lastFireMsRef = useRef<number | null>(null);

  // two-stage timing
  const pendingFirstMsRef = useRef<number | null>(null); // EARLY timestamp

  const vfcIdRef = useRef<number | null>(null);
  const rafIdRef = useRef<number | null>(null);
  const pausedRef = useRef(false);
  const didDrawRef = useRef(false);

  const [, setVis] = useState(document.visibilityState);
  useEffect(() => {
    const onVis = () => {
      pausedRef.current = document.visibilityState !== "visible";
      setVis(document.visibilityState);
    };
    document.addEventListener("visibilitychange", onVis);
    pausedRef.current = document.visibilityState !== "visible";
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  // Reset when run changes
  useEffect(() => {
    eventsSecRef.current = [];
    lastYRef.current = null;
    lastTsRef.current = null;
    cumUpRef.current = 0;
    cumDownRef.current = 0;
    armedRef.current = true;          // start primed
    lastFireMsRef.current = null;
    pendingFirstMsRef.current = null;
  }, [anchorMs]);

  useEffect(() => {
    // If disabled, clear once and bail.
    const canvas = canvasRef.current;
    if (!enabled) {
      if (canvas) {
        const g = canvas.getContext("2d");
        if (g) g.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
      }
      didDrawRef.current = false;
      return;
    }

    const video = videoRef.current;
    const lm = landmarkerRef.current;
    if (!video || !canvas || !lm) return;

    let canceled = false;

    const processFrame = () => {
      if (canceled || pausedRef.current) return;
      if (!video.videoWidth || !video.videoHeight) return;

      try {
        const ts = performance.now();
        const res = lm.detectForVideo(video, ts);
        const lms = res?.landmarks?.[0];

        // Draw overlay
        if (drawEnabled && lms && lms.length >= 21) {
          drawSkeleton?.(lms as any);
          didDrawRef.current = true;
        } else if (didDrawRef.current && !drawEnabled) {
          const g = canvas.getContext("2d");
          g?.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
          didDrawRef.current = false;
        }

        // Fingertip-only detection
        if (lms && lms.length >= 9) {
          const tip = lms[8]!;
          const y = tip.y; // 0..1, upward => y decreases

          const prevY = lastYRef.current;
          const prevTs = lastTsRef.current;

          if (prevY == null || prevTs == null) {
            lastYRef.current = y;
            lastTsRef.current = ts;
            return;
          }

          let dy = prevY - y; // >0 up, <0 down
          if (Math.abs(dy) < config.noiseEps) dy = 0;

          // dt in seconds; guard extremes
          const dtSec = Math.min(0.1, Math.max(1 / 240, (ts - prevTs) / 1000));
          const upVel = dy > 0 ? (dy / dtSec) : 0; // normalized units per second

          const lastFire = lastFireMsRef.current;
          const cooling = lastFire != null && (ts - lastFire) < config.refractoryMs;

          if (dy > 0) {
            // moving UP
            cumUpRef.current += dy;
            cumDownRef.current = 0;

            if (armedRef.current && !cooling) {
              // EARLY gate: need both distance AND minimal instantaneous velocity
              if (
                pendingFirstMsRef.current == null &&
                cumUpRef.current >= config.fireUpEps &&
                upVel >= config.minUpVel
              ) {
                pendingFirstMsRef.current = ts; // capture early time
              }

              // CONFIRM on extra distance (visual pulse + commit using EARLY time)
              if (
                pendingFirstMsRef.current != null &&
                cumUpRef.current >= config.confirmUpEps
              ) {
                const tFirstMs = pendingFirstMsRef.current;
                pendingFirstMsRef.current = null;
                lastFireMsRef.current = ts;
                armedRef.current = false;

                const base = anchorMs ?? performance.now();
                const tSec = Math.max(0, (tFirstMs - base) / 1000);

                try { onBeat?.(tSec); } catch {}

                if (recording) {
                  const arr = eventsSecRef.current;
                  if (arr.length >= maxEvents) arr.splice(0, arr.length - maxEvents + 1);
                  arr.push(tSec);
                }

                cumUpRef.current = 0;
                cumDownRef.current = 0;
              }
            }
          } else if (dy < 0) {
            // moving DOWN
            cumDownRef.current += -dy;
            cumUpRef.current = 0;
            pendingFirstMsRef.current = null; // cancel early if user bails

            if (!armedRef.current && !cooling && cumDownRef.current >= config.downRearmEps) {
              armedRef.current = true;
              cumDownRef.current = 0;
            }
          } else {
            // no significant motion
          }

          lastYRef.current = y;
          lastTsRef.current = ts;
        } else if (drawEnabled) {
          const g = canvas.getContext("2d");
          g?.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
          didDrawRef.current = false;
        }
      } catch {
        onError?.("Detection error");
      }
    };

    const runLoop = () => {
      processFrame(); // every frame
      rafIdRef.current = requestAnimationFrame(runLoop);
    };

    const v: any = video;
    const hasVFC = typeof v.requestVideoFrameCallback === "function";

    if (hasVFC) {
      const tickVFC = () => {
        processFrame();
        vfcIdRef.current = v.requestVideoFrameCallback(tickVFC);
      };
      vfcIdRef.current = v.requestVideoFrameCallback(tickVFC);
    } else {
      rafIdRef.current = requestAnimationFrame(runLoop);
    }

    return () => {
      const hasCancel = typeof (video as any).cancelVideoFrameCallback === "function";
      try {
        if (vfcIdRef.current != null && hasCancel) (video as any).cancelVideoFrameCallback(vfcIdRef.current);
      } catch {}
      if (rafIdRef.current != null) cancelAnimationFrame(rafIdRef.current);
      vfcIdRef.current = null;
      rafIdRef.current = null;
      const g = canvas.getContext("2d");
      g?.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
      didDrawRef.current = false;
    };
  }, [
    enabled,
    videoRef,
    canvasRef,
    landmarkerRef,
    drawSkeleton,
    anchorMs,
    config,
    onError,
    recording,
    maxEvents,
    drawEnabled,
    onBeat,
  ]);

  const resetEvents = () => { eventsSecRef.current = []; };
  return { eventsSecRef, resetEvents };
}
