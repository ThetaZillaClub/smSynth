"use client";
import { useEffect, useRef, useState } from "react";
import type { HandLandmarker } from "@mediapipe/tasks-vision";

export type DetectionConfig = {
  upVelThresh: number;
  downVelThresh: number;
  refractoryMs: number;
  primeWindowMs: number;
  primeRelBelow: number;
  primeDropRelMin: number;
  leaveMaxEps: number;
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
  detectEveryN?: number;
  maxEvents?: number;
  drawEnabled?: boolean;
  onBeat?: (tSec: number) => void;
  /** NEW: gate the whole loop until camera+model are ready */
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
  detectEveryN = 2,
  maxEvents = 128,
  drawEnabled = true,
  onBeat,
  enabled = true,
}: Props) {
  const eventsSecRef = useRef<number[]>([]);
  const lastTRef = useRef<number | null>(null);
  const yRelEmaRef = useRef<number | null>(null);
  const yRelLocalMaxRef = useRef<number | null>(null);
  const lastPrimeMsRef = useRef<number | null>(null);
  const lastFireMsRef = useRef<number | null>(null);
  const vfcIdRef = useRef<number | null>(null);
  const rafIdRef = useRef<number | null>(null);
  const frameCountRef = useRef(0);
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

  useEffect(() => {
    eventsSecRef.current = [];
    lastTRef.current = null;
    yRelEmaRef.current = null;
    yRelLocalMaxRef.current = null;
    lastPrimeMsRef.current = null;
    lastFireMsRef.current = null;
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

    const tickOnce = () => {
      if (canceled || pausedRef.current) return;
      if (!video.videoWidth || !video.videoHeight) return;
      const n = (frameCountRef.current = (frameCountRef.current + 1) % Math.max(1, detectEveryN));
      if (n !== 0) return;

      try {
        const ts = performance.now();
        const res = lm.detectForVideo(video, ts);
        const lms = res?.landmarks?.[0];

        if (drawEnabled && lms && lms.length >= 21) {
          drawSkeleton?.(lms as any);
          didDrawRef.current = true;
        } else if (didDrawRef.current && !drawEnabled) {
          const g = canvas.getContext("2d");
          g?.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
          didDrawRef.current = false;
        }

        if (lms && lms.length >= 9) {
          const tip = lms[8]!;
          const mcp = lms[5]!;
          const yRel = tip.y - mcp.y;

          const tPrev = lastTRef.current;
          const dt = Math.max(1, tPrev ? ts - tPrev : 16) / 1000;
          const tau = 0.020;
          const a = 1 - Math.exp(-dt / tau);
          const prevYRelE = yRelEmaRef.current ?? yRel;
          const yRelE = prevYRelE + a * (yRel - prevYRelE);
          const vy = tPrev ? (prevYRelE - yRelE) / dt : 0; // up = +

          yRelEmaRef.current = yRelE;
          lastTRef.current = ts;

          if (vy < 0) {
            if (yRelLocalMaxRef.current == null || yRelE > yRelLocalMaxRef.current) {
              yRelLocalMaxRef.current = yRelE;
            }
          }

          const downByRel = yRelE > config.primeRelBelow;
          const strongDown = vy < config.downVelThresh;
          const smallDownDip = (yRelE - prevYRelE) > config.primeDropRelMin;
          if (downByRel || strongDown || smallDownDip) lastPrimeMsRef.current = ts;

          const recentlyPrimed =
            lastPrimeMsRef.current != null && ts - lastPrimeMsRef.current <= config.primeWindowMs;
          const cooled =
            lastFireMsRef.current == null || ts - lastFireMsRef.current >= config.refractoryMs;
          const leftOfMax =
            yRelLocalMaxRef.current == null ? true : yRelE <= yRelLocalMaxRef.current - config.leaveMaxEps;

          if (recentlyPrimed && cooled && vy > config.upVelThresh && leftOfMax) {
            lastFireMsRef.current = ts;
            const base = anchorMs ?? performance.now();
            const tSec = Math.max(0, (ts - base) / 1000);
            try { onBeat?.(tSec); } catch {}
            if (recording) {
              const arr = eventsSecRef.current;
              if (arr.length >= maxEvents) arr.splice(0, arr.length - maxEvents + 1);
              arr.push(tSec);
            }
            yRelLocalMaxRef.current = yRelE;
          }
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
      tickOnce();
      rafIdRef.current = requestAnimationFrame(runLoop);
    };

    const v: any = video;
    const hasVFC = typeof v.requestVideoFrameCallback === "function";

    if (hasVFC) {
      const tickVFC = () => {
        tickOnce();
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
    detectEveryN,
    maxEvents,
    recording,
    drawEnabled,
    onBeat,
  ]);

  const resetEvents = () => { eventsSecRef.current = []; };
  return { eventsSecRef, resetEvents };
}
