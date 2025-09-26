// hooks/pitch/usePitchSampler.ts
"use client";

import { useCallback, useEffect, useRef } from "react";
import type { PitchSample } from "@/utils/scoring/score";

/**
 * Samples live pitch/confidence at a steady cadence (rAF throttled to `fps`)
 * and timestamps frames relative to a transport anchor (ms).
 *
 * - No state re-renders per frame; keeps samples in a ref.
 * - Call `snapshot()` at scoring time to read a copy.
 * - Call `reset()` when a new take starts.
 */
export default function usePitchSampler(opts: {
  active: boolean;                 // start/stop sampling
  anchorMs: number | null | undefined;
  hz: number | null;               // live pitch from detector
  confidence: number;              // live conf from detector
  fps?: number;                    // target sampling cadence (default 60)
}) {
  const { active, anchorMs, hz, confidence, fps = 60 } = opts;

  const samplesRef = useRef<PitchSample[]>([]);
  const anchorRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastEmitMsRef = useRef<number>(0);
  const liveRef = useRef<{ hz: number | null; conf: number }>({ hz: null, conf: 0 });

  // keep latest live values without causing re-renders
  useEffect(() => {
    liveRef.current = { hz, conf: confidence };
  }, [hz, confidence]);

  const reset = useCallback(() => {
    samplesRef.current = [];
    lastEmitMsRef.current = 0;
  }, []);

  const stop = useCallback(() => {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
  }, []);

  const tick = useCallback(() => {
    if (!active) return;
    const now = performance.now();

    // throttle to ~fps
    const minInterval = Math.max(1, 1000 / fps);
    if (now - lastEmitMsRef.current < minInterval) {
      rafRef.current = requestAnimationFrame(tick);
      return;
    }
    lastEmitMsRef.current = now;

    // latch anchor at start
    if (anchorRef.current == null) {
      anchorRef.current = typeof anchorMs === "number" ? anchorMs : now;
    }

    const tSec = Math.max(0, (now - anchorRef.current) / 1000);
    const { hz: curHz, conf } = liveRef.current;
    samplesRef.current.push({ tSec, hz: curHz, conf });

    rafRef.current = requestAnimationFrame(tick);
  }, [active, anchorMs, fps]);

  // start/stop lifecycle
  useEffect(() => {
    if (!active) {
      stop();
      return;
    }
    // fresh run
    stop();
    anchorRef.current = null; // re-arm on next tick
    rafRef.current = requestAnimationFrame(tick);
    return () => stop();
  }, [active, tick, stop]);

  // if anchor changes while active, restart with new anchor (rare but safe)
  useEffect(() => {
    if (!active) return;
    anchorRef.current = typeof anchorMs === "number" ? anchorMs : null;
  }, [active, anchorMs]);

  const snapshot = useCallback((): PitchSample[] => {
    return samplesRef.current.slice();
  }, []);

  return { reset, snapshot };
}
