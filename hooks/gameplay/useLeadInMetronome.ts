// hooks/gameplay/useLeadInMetronome.ts
import { useEffect, useRef } from "react";

/**
 * Plays a metronome COUNT-IN during the exercise lead-in.
 *
 * Timebase contract (IMPORTANT):
 * - `anchorMs` is the DOWNBEAT (start of the record window / phrase time t=0).
 * - The FIRST count-in click must occur `leadBeats * secPerBeat` BEFORE `anchorMs`.
 *
 * We schedule exactly once per `anchorMs`.
 */
export function useLeadInMetronome(opts: {
  enabled: boolean;
  metronome: boolean;
  leadBeats: number;
  loopPhase: "idle" | "call" | "lead-in" | "record" | "rest" | string;
  anchorMs: number | null | undefined;
  /** playLeadInTicks(beats, secPerBeat, startAtMs) */
  playLeadInTicks: (beats: number, secPerBeat: number, startAtMs: number) => Promise<void> | void;
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

  // Guard so we schedule exactly once per anchor/start time
  const scheduledStartRef = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled) return;
    if (!metronome) return;
    if (leadBeats <= 0) return;
    if (loopPhase !== "lead-in") return;
    if (anchorMs == null) return;

    // Treat anchor as downbeat; start first click BEFORE it.
    const firstClickAtMs = Math.round(anchorMs - leadBeats * secPerBeat * 1000);

    // Avoid duplicate scheduling for the same start time
    if (scheduledStartRef.current === firstClickAtMs) return;
    scheduledStartRef.current = firstClickAtMs;

    // Schedule the ticks leading up to the downbeat.
    void playLeadInTicks(leadBeats, secPerBeat, firstClickAtMs);
  }, [enabled, metronome, leadBeats, loopPhase, anchorMs, playLeadInTicks, secPerBeat]);
}
