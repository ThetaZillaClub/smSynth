"use client";
import { useEffect } from "react";
import type { LoopPhase } from "@/hooks/gameplay/usePracticeLoop";
import useHandBeat from "@/hooks/vision/useHandBeat";

export function useVisionBeatRunner({
  enabled, latencyMs, loopPhase, anchorMs, pretestActive, samplerReset, onBeat,
}: {
  enabled: boolean; latencyMs: number; loopPhase: LoopPhase; anchorMs: number | null | undefined;
  pretestActive: boolean; samplerReset: () => void; // caller injects sampler.reset
  onBeat?: (tMs: number) => void;
}) {
  const hand = useHandBeat({
    latencyMs,
    fireUpEps: 0.004, confirmUpEps: 0.012, downRearmEps: 0.006,
    refractoryMs: 90, noiseEps: 0.0015, minUpVel: 0.25, onBeat,
  });

  useEffect(() => {
    if (!enabled || pretestActive) { hand.stop(); return; }
    (async () => {
      try { await hand.preload(); if (!hand.isRunning) await hand.start(performance.now()); } catch {}
    })();
    return () => { if (!enabled || pretestActive) hand.stop(); };
  }, [enabled, pretestActive, hand]);

  useEffect(() => {
    if (pretestActive) return;
    if (loopPhase === "lead-in") {
      const a = anchorMs ?? performance.now();
      hand.reset(a);
      samplerReset();
    }
  }, [loopPhase, anchorMs, pretestActive, hand, samplerReset]);

  return hand; // expose snapshotEvents(), isRunning, etc.
}
