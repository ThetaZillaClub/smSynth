// hooks/gameplay/usePretest.ts
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { TimeSignature } from "@/utils/time/tempo";
import { beatsToSeconds } from "@/utils/time/tempo";
import { hzToMidi } from "@/utils/pitch/pitchMath";
import type { ScaleName } from "@/utils/phrase/scales";

export type CRMode =
  | { kind: "single_tonic" }        // Teacher: tonic (quarter). Student: tonic (1 response)
  | { kind: "derived_tonic" }       // Teacher: A440 (quarter). Student: tonic (1 response)
  | { kind: "guided_arpeggio" }     // Teacher: do-mi-sol-mi-do (5 quarters). Student: 1 response ✅
  | { kind: "internal_arpeggio" };  // No teacher call. Student: 1 response (1–3–5–3–1)

export type PretestStatus = "idle" | "call" | "response" | "done";

type PlayerApi = {
  playA440: (durSec: number) => Promise<void>;
  playMidiList: (midi: number[], noteDurSec: number) => Promise<void>;
};

type Opts = {
  sequence: CRMode[];
  bpm: number;
  ts: TimeSignature;

  scale: { tonicPc: number; name: ScaleName };
  lowHz: number | null;
  highHz: number | null;

  player: PlayerApi;
};

type ReturnShape = {
  status: PretestStatus;
  running: boolean;
  shouldRecord: boolean;
  modeIndex: number;
  subResponse: number;
  anchorMs: number | null;
  currentLabel: string;
  start: () => void;
  continueResponse: () => void;
  reset: () => void;
};

const isMinorish = (name: ScaleName) =>
  [
    "natural_minor",
    "harmonic_minor",
    "melodic_minor",
    "dorian",
    "phrygian",
    "locrian",
    "minor_pentatonic",
  ].includes(name as string);

function triadIntervalsForScale(name: ScaleName): [third: number, fifth: number] {
  if (name === "locrian") return [3, 6];            // diminished
  return isMinorish(name) ? [3, 7] : [4, 7];        // minor vs. major
}

function pickLowTonicMidi(lowHz: number | null, tonicPc: number): number | null {
  if (lowHz == null) return null;
  const lowM = Math.round(hzToMidi(lowHz));
  for (let m = lowM; m < lowM + 36; m++) {
    if ((((m % 12) + 12) % 12) === (((tonicPc % 12) + 12) % 12)) return m;
  }
  return null;
}

export default function usePretest({
  sequence,
  bpm,
  ts,
  scale,
  lowHz,
  highHz,
  player,
}: Opts): ReturnShape {
  const [status, setStatus] = useState<PretestStatus>("idle");
  const [running, setRunning] = useState(false);
  const [modeIndex, setModeIndex] = useState(0);
  const [subResponse, setSubResponse] = useState(0);
  const [shouldRecord, setShouldRecord] = useState(false);
  const [anchorMs, setAnchorMs] = useState<number | null>(null);

  const timerRef = useRef<number | null>(null);
  const clearTimer = useCallback(() => {
    if (timerRef.current != null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const quarterSec = beatsToSeconds(1, bpm, ts.den);
  const tonicMidi = useMemo(() => pickLowTonicMidi(lowHz, scale.tonicPc), [lowHz, scale.tonicPc]);
  const [third, fifth] = useMemo(() => triadIntervalsForScale(scale.name), [scale.name]);

  // Idempotent scheduler guard: ensure a CALL is scheduled once per (modeIndex) and only when resources are ready.
  const scheduledKeyRef = useRef<string | null>(null);
  const resetScheduledKey = () => { scheduledKeyRef.current = null; };

  const currentLabel = useMemo(() => {
    if (status === "done") return "Pre-test complete";
    if (!sequence.length) return "No pre-test selected";
    const mode = sequence[modeIndex]?.kind;
    if (status === "call") {
      if (mode === "single_tonic") return "Listen: tonic";
      if (mode === "derived_tonic") return "Listen: A440";
      if (mode === "guided_arpeggio") return "Listen: tonic arpeggio (up–down)";
      if (mode === "internal_arpeggio") return "Prepare: internal arpeggio (no prompt)";
    }
    if (status === "response") {
      if (mode === "single_tonic") return "Sing: tonic";
      if (mode === "derived_tonic") return "Sing: tonic (derived from A440)";
      if (mode === "guided_arpeggio") return "Sing: do–mi–sol–mi–do"; // single pass
      if (mode === "internal_arpeggio") return "Sing (internal): do–mi–sol–mi–do";
    }
    return "Pre-test";
  }, [sequence, modeIndex, status]);

  const start = useCallback(() => {
    if (!sequence.length) {
      setStatus("done");
      setRunning(false);
      setShouldRecord(false);
      setAnchorMs(null);
      return;
    }
    setRunning(true);
    setStatus("call");
    setModeIndex(0);
    setSubResponse(0);
    setShouldRecord(false);
    setAnchorMs(null);
    resetScheduledKey();
  }, [sequence.length]);

  const reset = useCallback(() => {
    clearTimer();
    setRunning(false);
    setShouldRecord(false);
    setStatus("idle");
    setModeIndex(0);
    setSubResponse(0);
    setAnchorMs(null);
    resetScheduledKey();
  }, [clearTimer]);

  // Fire the teacher's call when entering "call" (idempotent; waits for tonic if required)
  useEffect(() => {
    if (!running || status !== "call") return;

    const mode = sequence[modeIndex]?.kind;
    // Build a guard key that changes when relevant inputs change.
    const needTonic = mode === "single_tonic" || mode === "guided_arpeggio";
    const key = `m:${modeIndex}|need:${needTonic ? 1 : 0}|ton:${tonicMidi ?? -1}|b:${bpm}|d:${ts.den}`;
    if (scheduledKeyRef.current === key) return;

    // If the mode needs tonic but it's not ready yet (range not loaded), wait — do not skip.
    if (needTonic && tonicMidi == null) {
      // We'll re-run when tonicMidi becomes available.
      return;
    }

    // From this point, we will schedule exactly once per key.
    scheduledKeyRef.current = key;
    clearTimer();

    (async () => {
      if (mode === "internal_arpeggio") {
        // No teacher call; go straight to response.
        setStatus("response");
        setShouldRecord(true);
        setAnchorMs(performance.now());
        return;
      }

      if (mode === "derived_tonic") {
        await player.playA440(quarterSec);
        timerRef.current = window.setTimeout(() => {
          setStatus("response");
          setShouldRecord(true);
          setAnchorMs(performance.now());
          timerRef.current = null;
        }, Math.ceil(quarterSec * 1000) + 16);
        return;
      }

      if (mode === "single_tonic") {
        await player.playMidiList([tonicMidi!], quarterSec);
        timerRef.current = window.setTimeout(() => {
          setStatus("response");
          setShouldRecord(true);
          setAnchorMs(performance.now());
          timerRef.current = null;
        }, Math.ceil(quarterSec * 1000) + 16);
        return;
      }

      if (mode === "guided_arpeggio") {
        const root = tonicMidi!;
        const upDown = [root, root + third, root + fifth, root + third, root];
        const callDur = upDown.length * quarterSec;
        await player.playMidiList(upDown, quarterSec);
        timerRef.current = window.setTimeout(() => {
          setStatus("response");
          setShouldRecord(true);
          setAnchorMs(performance.now());
          timerRef.current = null;
        }, Math.ceil(callDur * 1000) + 16);
        return;
      }
    })();
  }, [running, status, modeIndex, sequence, quarterSec, player, tonicMidi, third, fifth, clearTimer, bpm, ts.den]);

  const continueResponse = useCallback(() => {
    if (!sequence.length) return;

    const mode = sequence[modeIndex]?.kind;
    setShouldRecord(false);
    setAnchorMs(null);

    // ✅ All current pretest modes are single-pass now.
    const needsTwo = false;

    if (status === "response" && needsTwo && subResponse === 0) {
      setSubResponse(1);
      setStatus("response");
      setShouldRecord(true);
      setAnchorMs(performance.now());
      resetScheduledKey();
      return;
    }

    // Advance to next mode or finish
    const nextIndex = modeIndex + 1;
    if (nextIndex >= sequence.length) {
      setStatus("done");
      setRunning(false);
      return;
    }
    setModeIndex(nextIndex);
    setSubResponse(0);
    setStatus("call");
    resetScheduledKey();
  }, [sequence, modeIndex, status, subResponse]);

  // Cleanup
  useEffect(() => () => clearTimer(), [clearTimer]);

  return {
    status,
    running,
    shouldRecord,
    modeIndex,
    subResponse,
    anchorMs,
    currentLabel,
    start,
    continueResponse,
    reset,
  };
}
