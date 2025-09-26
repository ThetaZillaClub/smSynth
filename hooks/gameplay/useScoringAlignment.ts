// hooks/gameplay/useScoringAlignment.ts
"use client";

import { useCallback } from "react";
import type { PitchSample } from "@/utils/scoring/score";

/**
 * Align raw capture streams to phrase-time (note 1 = t=0), compensating
 * for pipeline latency (pitch windowing / gesture pipeline) *before* scoring.
 *
 * - samplesRaw/beatsRaw are expected in seconds, anchored to the same transport
 *   anchor used by the stage overlays (loop.anchorMs → performance.now()).
 * - leadInSec is subtracted to put t=0 at the first note (same as overlays).
 * - Optional latency offsets shift *earlier* to undo model/gesture lag.
 */
export default function useScoringAlignment() {
  return useCallback(
    (
      samplesRaw: PitchSample[] | null | undefined,
      beatsRaw: number[] | null | undefined,
      leadInSec: number | null | undefined,
      opts: {
        clipBelowSec?: number;     // keep a bit of pre-roll for grace
        pitchLagSec?: number;      // model + smoothing latency (sec)
        gestureLagSec?: number;    // hand-beat latency (sec)
      } = {}
    ): { samples: PitchSample[]; beats: number[] } => {
      const {
        clipBelowSec = 0.5,       // keep up to 500 ms of negative time
        pitchLagSec = 0,          // shifted earlier by this much
        gestureLagSec = 0,
      } = opts;

      const tLead = typeof leadInSec === "number" && isFinite(leadInSec) ? leadInSec : 0;

      const samples = (Array.isArray(samplesRaw) ? samplesRaw : [])
        .map((s) => ({
          ...s,
          // transport → phrase time, then undo model lag
          tSec: (s.tSec ?? 0) - tLead - pitchLagSec,
        }))
        // drop only deep pre-roll
        .filter((s) => s.tSec >= -clipBelowSec);

      const beats = (Array.isArray(beatsRaw) ? beatsRaw : [])
        .map((t) => t - tLead - gestureLagSec)
        .filter((t) => t >= -clipBelowSec);

      return { samples, beats };
    },
    []
  );
}
