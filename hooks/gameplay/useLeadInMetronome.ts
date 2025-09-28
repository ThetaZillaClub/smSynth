// hooks/gameplay/useLeadInMetronome.ts
import { useEffect, useRef } from "react";

/**
 * Plays a metronome COUNT-IN during the exercise lead-in.
 * - Triggers when loopPhase === "lead-in"
 * - Uses `anchorMs` as the moment the first click should fire
 */
export function useLeadInMetronome(opts: {
  enabled: boolean;
  metronome: boolean;
  leadBeats: number;
  loopPhase: "idle" | "call" | "lead-in" | "record" | "rest" | string;
  anchorMs: number | null | undefined;
  playLeadInTicks: (beats: number, secPerBeat: number, anchorMs: number) => Promise<void> | void;
  secPerBeat: number;
}) {
  const {
    enabled,
    metronome,
    leadBeats,
    loopPhase,
    anchorMs,
    playLeadInTicks,
    secPerBeat,
  } = opts;

  // Guard so we schedule exactly once per anchor
  const scheduledStartRef = useRef<number | null>(null);

  useEffect(() => {
    // Only schedule when: feature enabled, metronome on, have a lead-in, IN the "lead-in" phase,
    // and we have a valid anchor.
    if (!enabled) return;
    if (!metronome) return;
    if (leadBeats <= 0) return;
    if (loopPhase !== "lead-in") return;
    if (anchorMs == null) return;

    if (scheduledStartRef.current === anchorMs) return;
    scheduledStartRef.current = anchorMs;

    // Start clicks AT the start of lead-in so they count down toward the downbeat.
    void playLeadInTicks(leadBeats, secPerBeat, anchorMs);
  }, [enabled, metronome, leadBeats, loopPhase, anchorMs, playLeadInTicks, secPerBeat]);
}
