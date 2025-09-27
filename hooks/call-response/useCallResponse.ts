// hooks/call-response/useCallResponse.ts
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { TimeSignature } from "@/utils/time/tempo";
import { secondsPerBeat, beatsToSeconds, barsToBeats } from "@/utils/time/tempo";
import type { TakeScore } from "@/utils/scoring/score";

type Phase = "idle" | "calling" | "recording" | "evaluating" | "review";

export type UseCallResponseArgs = {
  // timing
  bpm?: number;
  ts?: TimeSignature;
  leadBars?: number;      // lead after the call before recording opens (default 1)
  exerciseBars?: number;  // record window bars (default 2)
  // integration points
  makeCall: () => Promise<void> | void;             // play the call (awaits until done)
  startRecord: () => Promise<void> | void;          // open mic/detector
  stopRecord: () => Promise<void> | void;           // close mic/detector
  scoreCurrentTake: () => Promise<TakeScore>;       // compute score for the take
};

export function useCallResponse({
  bpm = 80,
  ts = { num: 4, den: 4 },
  leadBars = 1,
  exerciseBars = 2,
  makeCall,
  startRecord,
  stopRecord,
  scoreCurrentTake,
}: UseCallResponseArgs) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [status, setStatus] = useState("Ready");
  const [startedAtMs, setStartedAtMs] = useState<number | null>(null);
  const [isRecording, setIsRecording] = useState(false);

  const [score, setScore] = useState<TakeScore | undefined>(undefined);
  const [sessionScores, setSessionScores] = useState<TakeScore[]>([]);
  const [passed, setPassed] = useState(false);

  const timers = useRef<number[]>([]);
  const clearTimers = () => { timers.current.forEach(clearTimeout); timers.current = []; };

  // derived timing
  const secPerBeat = secondsPerBeat(bpm, ts.den);
  const leadSec = beatsToSeconds(barsToBeats(leadBars, ts.num), bpm, ts.den);
  const recordSec = beatsToSeconds(barsToBeats(exerciseBars, ts.num), bpm, ts.den);

  const start = useCallback(async () => {
    // CALL
    setPhase("calling");
    setStatus("Call: listen…");
    await makeCall(); // <— important: we await playback so the mic won’t hear it

    // open record window after the lead-in
    setStatus("Get ready…");
    const t = window.setTimeout(async () => {
      setPhase("recording");
      setStatus("Your turn: sing!");
      setStartedAtMs(performance.now());
      setIsRecording(true);
      await startRecord();

      // auto-close after record window (games can also close manually)
      const t2 = window.setTimeout(async () => {
        setIsRecording(false);
        await stopRecord();
        setPhase("evaluating");
        setStatus("Evaluating…");
        const s = await scoreCurrentTake();
        setScore(s);
        setSessionScores((prev) => [...prev, s]);
        setPassed(s.final?.percent >= 60); // soft default; games can choose their own thresholds
        setPhase("review");
        setStatus(s.final?.percent >= 60 ? "Great! You passed." : "Close! Review & try again.");
      }, Math.max(50, recordSec * 1000));
      timers.current.push(t2);
    }, Math.max(10, leadSec * 1000));
    timers.current.push(t);
  }, [makeCall, startRecord, stopRecord, scoreCurrentTake, leadSec, recordSec]);

  const reset = useCallback(() => {
    clearTimers();
    setIsRecording(false);
    setStartedAtMs(null);
    setScore(undefined);
    setPassed(false);
    setPhase("idle");
    setStatus("Ready");
  }, []);

  useEffect(() => () => clearTimers(), []);

  const ui = useMemo(() => ({
    phase, statusText: status, isRecording, startedAtMs,
    timing: { leadSec, recordSec }, score, sessionScores, passed,
  }), [phase, status, isRecording, startedAtMs, leadSec, recordSec, score, sessionScores, passed]);

  return { ...ui, start, reset, setPassed, setScore };
}
