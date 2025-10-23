// hooks/gameplay/usePolarTargetOverride.ts
import { useEffect, useRef, useState, useMemo } from "react";
import type { Phrase } from "@/utils/stage";

// Keep local so we don't import other hooks
export type LoopPhase = "idle" | "call" | "lead-in" | "record" | "rest";

/**
 * Decides what the Polar view should target:
 *  - During LEAD-IN: the currently "active" phrase note (rel to tonic)
 *  - During RECORD (timing-free): the capture's current target (from per-note capture)
 *  - Otherwise: undefined
 */
export default function usePolarTargetOverride(opts: {
  pretestActive: boolean;
  loopPhase: LoopPhase;
  phrase: Phrase | null;
  anchorMs: number | null;
  tonicPc: number | null;
  captureTargetRel?: number | null;
  captureTargetMidi?: number | null;
}): { targetRelOverride?: number; targetMidiOverride?: number } {
  const {
    pretestActive,
    loopPhase,
    phrase,
    anchorMs,
    tonicPc,
    captureTargetRel,
    captureTargetMidi,
  } = opts;

  const tonicPcMod = useMemo(
    () => (((tonicPc ?? 0) % 12) + 12) % 12,
    [tonicPc]
  );

  const rafRef = useRef<number | null>(null);
  const [leadInRel, setLeadInRel] = useState<number | null>(null);
  const [leadInMidi, setLeadInMidi] = useState<number | null>(null);

  // Track the note under the "playhead" during LEAD-IN
  useEffect(() => {
    // Only run while actively leading in with a known phrase & anchor
    const active =
      !pretestActive && loopPhase === "lead-in" && phrase && anchorMs != null;

    if (!active) {
      setLeadInRel(null);
      setLeadInMidi(null);
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      return;
    }

    const tick = () => {
      const tSec = (performance.now() - (anchorMs as number)) / 1000;
      let rel: number | null = null;
      let curMidi: number | null = null;

      for (const n of phrase!.notes) {
        const s = n.startSec;
        const e = s + n.durSec;
        if (tSec >= s && tSec < e) {
          const midiRounded = Math.round(n.midi);
          const pcAbs = ((midiRounded % 12) + 12) % 12;
          rel = ((pcAbs - tonicPcMod) + 12) % 12;
          curMidi = midiRounded;
          break;
        }
      }

      setLeadInRel(rel);
      setLeadInMidi(curMidi);
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [pretestActive, loopPhase, phrase, anchorMs, tonicPcMod]);

  // Final decision: lead-in note wins while in lead-in; otherwise use capture targets
  const targetRelOverride =
    loopPhase === "lead-in"
      ? (typeof leadInRel === "number" ? leadInRel : undefined)
      : (typeof captureTargetRel === "number" ? captureTargetRel : undefined);

  const targetMidiOverride =
    loopPhase === "lead-in"
      ? (typeof leadInMidi === "number" ? leadInMidi : undefined)
      : (typeof captureTargetMidi === "number" ? captureTargetMidi : undefined);

  return { targetRelOverride, targetMidiOverride };
}
