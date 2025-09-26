// hooks/gameplay/useLeadInMetronome.ts
import { useEffect, useRef } from "react";

export function useLeadInMetronome(opts: {
  enabled: boolean;
  metronome: boolean;
  leadBeats: number;
  loopPhase: "idle" | "record" | "rest" | string;
  anchorMs: number | null | undefined;
  playLeadInTicks: (beats: number, secPerBeat: number, anchorMs: number) => Promise<void> | void;
  secPerBeat: number;
}) {
  const {
    enabled, metronome, leadBeats, loopPhase, anchorMs,
    playLeadInTicks, secPerBeat,
  } = opts;

  const scheduledLeadAnchorRef = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled) return;
    if (!metronome) return;
    if (leadBeats <= 0) return;
    if (loopPhase !== "record") return;
    if (anchorMs == null) return;

    if (scheduledLeadAnchorRef.current === anchorMs) return;
    scheduledLeadAnchorRef.current = anchorMs;

    void playLeadInTicks(leadBeats, secPerBeat, anchorMs);
  }, [enabled, metronome, leadBeats, loopPhase, anchorMs, playLeadInTicks, secPerBeat]);
}
