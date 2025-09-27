// components/vision/stage/VisionStage.tsx
"use client";
import React, { useCallback, useRef, useState, useEffect, useMemo } from "react";
import { HandLandmarker } from "@mediapipe/tasks-vision";
import { StageCamera, StageCanvas, StageCenterUI, StageFooter } from "./stage-layout";
import useCameraStream from "./hooks/useCameraStream";
import useHandLandmarker from "./hooks/useHandLandmarker";
import useCanvasSizer from "./hooks/useCanvasSizer";
import useSkeletonDrawer from "./hooks/useSkeletonDrawer";
import useDetectionLoop, { type DetectionConfig } from "./hooks/useDetectionLoop";
import useUiBeatCounter from "./hooks/useUiBeatCounter";
import { iqrFilter, median } from "./hooks/latency";

// ✅ Reuse the proven audio engine from Training
import usePhrasePlayer from "@/hooks/audio/usePhrasePlayer";

const KEY = "vision:latency-ms";
type Phase = "idle" | "lead" | "run" | "done";

const HAND_CONNECTIONS: Array<[number, number]> = [
  [0, 1], [1, 2], [2, 5], [5, 9], [9, 13], [13, 17], [17, 0],
  [1, 2], [2, 3], [3, 4],
  [5, 6], [6, 7], [7, 8],
  [9, 10], [10, 11], [11, 12],
  [13, 14], [14, 15], [15, 16],
  [17, 18], [18, 19], [19, 20],
  [0, 5], [0, 9], [0, 13], [0, 17],
];

export default function VisionStage() {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [anchorMs, setAnchorMs] = useState<number | null>(null);
  const [resultMs, setResultMs] = useState<number | null>(null);
  const [matched, setMatched] = useState<number>(0);

  // readiness flags
  const [camReady, setCamReady] = useState(false);

  // Tempo
  const bpm = 80;
  const secPerBeat = 60 / bpm;
  const leadBeats = 4;
  const runBeats = 16;

  // Camera (stable constraints)
  const videoConstraints = useMemo<MediaStreamConstraints["video"]>(
    () => ({ facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 30 } }),
    []
  );

  useCameraStream({ videoRef, onError: setError, constraints: videoConstraints });

  // Detect when <video> actually has dimensions (so we can draw)
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const mark = () => setCamReady(Boolean(v.videoWidth && v.videoHeight));
    mark();
    v.addEventListener("loadedmetadata", mark);
    v.addEventListener("loadeddata", mark);
    v.addEventListener("playing", mark);
    const id = window.setInterval(mark, 400);
    return () => {
      v.removeEventListener("loadedmetadata", mark);
      v.removeEventListener("loadeddata", mark);
      v.removeEventListener("playing", mark);
      window.clearInterval(id);
    };
  }, []);

  // Hand landmarker (+ ready flag)
  const { landmarkerRef, ready: lmReady } = useHandLandmarker(setError) as {
    landmarkerRef: React.RefObject<HandLandmarker | null>;
    ready: boolean;
  };

  // Canvas sizing
  useCanvasSizer(wrapRef, canvasRef, { maxDpr: 2 });

  // Skeleton overlay
  const { draw: drawSkeleton, clear: clearSkeleton, pulse } = useSkeletonDrawer(canvasRef, videoRef, {
    connections: HAND_CONNECTIONS,
    drawEveryN: 2,
    tipIndex: 8,
    objectContain: true,
    pulseMs: 140,
  } as any);

  // Detection config
  const detectionConfig: DetectionConfig = useMemo(
    () => ({
      upVelThresh: 0.50,
      downVelThresh: -0.40,
      refractoryMs: 140,
      primeWindowMs: 600,
      primeRelBelow: 0.012,
      primeDropRelMin: 0.008,
      leaveMaxEps: 0.0035,
    }),
    []
  );

  // Enable detection only when camera + model are ready
  const detEnabled = camReady && lmReady;
  const drawEnabled = detEnabled && phase === "idle";
  const recording  = phase === "run";
  const detectEveryN = 2;

  const { eventsSecRef, resetEvents } = useDetectionLoop({
    videoRef,
    canvasRef,
    landmarkerRef,
    anchorMs,
    drawSkeleton,
    config: detectionConfig,
    onError: setError,
    recording,
    detectEveryN,
    maxEvents: 128,
    drawEnabled,
    enabled: detEnabled,
    onBeat: () => { if (drawEnabled) pulse(); },
  });

  // UI beat counter
  const uiBeat = useUiBeatCounter(phase, anchorMs, secPerBeat, leadBeats, runBeats);

  // ✅ Use the Training game's audio path
  const { playLeadInTicks } = usePhrasePlayer();

  // Cleanup
  useEffect(() => {
    return () => {
      try { clearSkeleton(); } catch {}
    };
  }, [clearSkeleton]);

  /**
   * Start calibration:
   * - Anchor on perf clock ~0.55s in the future.
   * - Schedule lead-in ticks + run ticks via Training audio engine.
   */
  const startCalibration = useCallback(async () => {
    if (phase !== "idle") return;

    try {
      setResultMs(null);
      setMatched(0);
      resetEvents();
      setError(null);

      // Perf-time anchor ~550ms ahead
      const startPerfMs = performance.now() + 550;

      setAnchorMs(startPerfMs);
      setPhase("lead");

      // Schedule lead-in ticks
      playLeadInTicks(leadBeats, secPerBeat, startPerfMs);
      // Schedule run ticks immediately after the lead-in window
      const runStartMs = startPerfMs + leadBeats * secPerBeat * 1000;
      playLeadInTicks(runBeats, secPerBeat, runStartMs);

      const leadMs = leadBeats * secPerBeat * 1000;
      const runMs  = runBeats  * secPerBeat * 1000;

      // into RUN
      window.setTimeout(() => setPhase("run"), Math.ceil(leadMs) + 12);

      // finish → compute result
      window.setTimeout(() => {
        setPhase("done");
        const expected: number[] = Array.from(
          { length: runBeats },
          (_, i) => leadBeats * secPerBeat + i * secPerBeat
        );
        const detected = eventsSecRef.current.slice();
        const maxMs = 400;
        const used = new Set<number>();
        const deltas: number[] = [];

        for (const tExp of expected) {
          let bestJ = -1, bestErr = Infinity;
          for (let j = 0; j < detected.length; j++) {
            if (used.has(j)) continue;
            const errMs = Math.abs((detected[j] - tExp) * 1000);
            if (errMs < bestErr) { bestErr = errMs; bestJ = j; }
          }
          if (bestJ >= 0 && bestErr <= maxMs) {
            used.add(bestJ);
            deltas.push((detected[bestJ] - tExp) * 1000);
          }
        }

        const filtered = iqrFilter(deltas.filter((d) => isFinite(d)));
        const med = median(filtered);
        const latency = Math.max(40, Math.round(isFinite(med) ? med : 90));
        setMatched(deltas.length);
        setResultMs(latency);
        try { localStorage.setItem(KEY, String(latency)); } catch {}
      }, Math.ceil(leadMs + runMs) + 30);
    } catch (e) {
      setError((e as Error)?.message ?? "Audio error");
    }
  }, [
    phase,
    resetEvents,
    secPerBeat,
    leadBeats,
    runBeats,
    playLeadInTicks,
    eventsSecRef,
  ]);

  return (
    <div
      ref={wrapRef}
      className="relative w-full h-full bg-black"
      onClick={() => { if (phase === "idle") startCalibration(); }}
      style={{ cursor: phase === "idle" ? "pointer" : "default" }}
      title={phase === "idle" ? "Click anywhere to start calibration" : undefined}
    >
      <StageCamera
        ref={videoRef}
        aria-label="Camera preview"
        className="absolute inset-0 w-full h-full object-contain bg-black"
      />
      <StageCanvas
        ref={canvasRef}
        aria-hidden
        className={[
          "absolute inset-0 w-full h-full pointer-events-none transition-opacity",
          drawEnabled ? "opacity-100" : "opacity-0",
        ].join(" ")}
      />
      <StageCenterUI phase={phase} uiBeat={uiBeat} onStart={startCalibration} />
      <StageFooter
        phase={phase}
        runBeats={runBeats}
        matched={matched}
        resultMs={resultMs}
        error={error}
        onReset={() => setPhase("idle")}
      />
    </div>
  );
}
