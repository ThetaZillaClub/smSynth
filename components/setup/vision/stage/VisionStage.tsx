// components/vision/stage/VisionStage.tsx
"use client";
import React, { useCallback, useRef, useState, useEffect, useMemo } from "react";
import useStudentRow from "@/hooks/students/useStudentRow";
import useStudentGestureLatencyUpdater from "@/hooks/students/useStudentGestureLatencyUpdater";
import { HandLandmarker } from "@mediapipe/tasks-vision";
import { StageCamera, StageCanvas, StageFooter } from "./stage-layout";
import useCameraStream from "./hooks/useCameraStream";
import useHandLandmarker from "./hooks/useHandLandmarker";
import useCanvasSizer from "./hooks/useCanvasSizer";
import useSkeletonDrawer from "./hooks/useSkeletonDrawer";
import useDetectionLoop, { type DetectionConfig } from "./hooks/useDetectionLoop";
import useUiBeatCounter from "./hooks/useUiBeatCounter";
import { iqrFilter, median } from "./hooks/latency";
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

const TOP_GAP_CSS = "calc(env(safe-area-inset-top, 0px) + 40px)";

export default function VisionStage() {
  const stageAreaRef = useRef<HTMLDivElement | null>(null);
  const stageViewportRef = useRef<HTMLDivElement | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [anchorMs, setAnchorMs] = useState<number | null>(null);
  const [resultMs, setResultMs] = useState<number | null>(null);
  const [matched, setMatched] = useState<number>(0);

  const [camReady, setCamReady] = useState(false);

  const bpm = 80;
  const secPerBeat = 60 / bpm;
  const leadBeats = 4;
  const runBeats = 16;
  const { studentRowId } = useStudentRow({ studentIdFromQuery: null });
  const pushLatency = useStudentGestureLatencyUpdater(studentRowId);
  const videoConstraints = useMemo<MediaStreamConstraints["video"]>(
    () => ({ facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 30 } }),
    []
  );

  useCameraStream({ videoRef, onError: setError, constraints: videoConstraints });

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

  const { landmarkerRef, ready: lmReady } = useHandLandmarker(setError) as {
    landmarkerRef: React.RefObject<HandLandmarker | null>;
    ready: boolean;
  };

  useCanvasSizer(stageViewportRef, canvasRef, { maxDpr: 2 });

  const { draw: drawSkeleton, clear: clearSkeleton, pulse } = useSkeletonDrawer(
    canvasRef,
    videoRef,
    {
      connections: HAND_CONNECTIONS,
      drawEveryN: 1,
      tipIndex: 8,
      objectContain: true,
      pulseMs: 140,
      mirrorX: false,
    }
  );

  const detectionConfig: DetectionConfig = useMemo(
    () => ({
      fireUpEps: 0.004,
      confirmUpEps: 0.012,
      downRearmEps: 0.006,
      refractoryMs: 10,
      noiseEps: 0.0015,
      minUpVel: 0.1,
    }),
    []
  );

  const detEnabled = camReady && lmReady;
  const drawEnabled = detEnabled && phase === "idle";
  const recording = phase === "run";

  const { eventsSecRef, resetEvents } = useDetectionLoop({
    videoRef,
    canvasRef,
    landmarkerRef,
    anchorMs,
    drawSkeleton,
    config: detectionConfig,
    onError: setError,
    recording,
    maxEvents: 128,
    drawEnabled,
    enabled: detEnabled,
    onBeat: () => {
      if (drawEnabled) pulse();
    },
  });

  const uiBeat = useUiBeatCounter(phase, anchorMs, secPerBeat, leadBeats, runBeats);
  const { playLeadInTicks } = usePhrasePlayer();

  useEffect(() => {
    return () => {
      try {
        clearSkeleton();
      } catch {}
    };
  }, [clearSkeleton]);

  const startCalibration = useCallback(async () => {
    if (phase !== "idle") return;

    try {
      setResultMs(null);
      setMatched(0);
      resetEvents();
      setError(null);

      const startPerfMs = performance.now() + 550;
      setAnchorMs(startPerfMs);
      setPhase("lead");

      // schedule ticks relative to the same perf anchor
      playLeadInTicks(leadBeats, secPerBeat, startPerfMs);
      const runStartMs = startPerfMs + leadBeats * secPerBeat * 1000;
      playLeadInTicks(runBeats, secPerBeat, runStartMs);

      const leadMs = leadBeats * secPerBeat * 1000;
      const runMs = runBeats * secPerBeat * 1000;

      // into RUN
      window.setTimeout(() => setPhase("run"), Math.ceil(leadMs) + 12);

      // finish → compute result
      window.setTimeout(() => {
        setPhase("done");

        // expected beat times in SECONDS since anchor
        const expected: number[] = Array.from(
          { length: runBeats },
          (_, i) => leadBeats * secPerBeat + i * secPerBeat
        );

        // detected tSec values (SECONDS since anchor)
        const detected = eventsSecRef.current.slice();

        // greedy 1-1 match with 400ms bound
        const maxMs = 400;
        const used = new Set<number>();
        const deltasMs: number[] = [];

        for (const tExp of expected) {
          let bestJ = -1,
            bestErr = Infinity;
          for (let j = 0; j < detected.length; j++) {
            if (used.has(j)) continue;
            const errMs = Math.abs((detected[j] - tExp) * 1000);
            if (errMs < bestErr) {
              bestErr = errMs;
              bestJ = j;
            }
          }
          if (bestJ >= 0 && bestErr <= maxMs) {
            used.add(bestJ);
            deltasMs.push((detected[bestJ] - tExp) * 1000);
          }
        }

        const filtered = iqrFilter(deltasMs.filter((d) => Number.isFinite(d)));
        const medAbs = median(filtered.map((d) => Math.abs(d)));

        const latency: number | null = Number.isFinite(medAbs) ? Math.round(medAbs) : null;

        setMatched(deltasMs.length);
        setResultMs(latency);
        // persist if we have a valid result
        try {
          if (latency != null) {
            void pushLatency(latency);
          }
        } catch {}        
        try {
          if (latency != null) localStorage.setItem(KEY, String(latency));
          else localStorage.removeItem(KEY);
          window.dispatchEvent(
            new CustomEvent("vision:latency-changed", { detail: { latencyMs: latency ?? null } })
          );
        } catch {}
      }, Math.ceil(leadMs + runMs) + 30);
    } catch (e) {
      setError((e as Error)?.message ?? "Audio error");
    }
  }, [phase, resetEvents, secPerBeat, leadBeats, runBeats, playLeadInTicks, eventsSecRef, pushLatency]);

  return (
    <div className="w-full h-full flex flex-col bg-transparent" style={{ cursor: "default" }}>
      {/* STAGE AREA */}
      <div ref={stageAreaRef} className="relative flex-1 min-h-0 bg-transparent">
        <div
          ref={stageViewportRef}
          className="absolute left-0 right-0 bottom-0"
          style={{ top: TOP_GAP_CSS }}
          aria-label="Vision viewport"
        >
          <StageCamera
            ref={videoRef}
            aria-label="Camera preview"
            className="absolute inset-0 w-full h-full object-contain bg-transparent"
          />
          <StageCanvas
            ref={canvasRef}
            aria-hidden
            className={[
              "absolute inset-0 w-full h-full pointer-events-none transition-opacity",
              detEnabled && phase === "idle" ? "opacity-100" : "opacity-0",
            ].join(" ")}
          />
        </div>
      </div>

      {/* FOOTER */}
      <StageFooter
        phase={phase}
        uiBeat={uiBeat}
        runBeats={runBeats}
        matched={matched}
        resultMs={resultMs}
        error={error}
        onStart={startCalibration}
        onReset={() => setPhase("idle")}
      />
    </div>
  );
}
