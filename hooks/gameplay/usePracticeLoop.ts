// hooks/gameplay/usePracticeLoop.ts
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export type LoopPhase = "idle" | "call" | "record" | "rest";

type Opts = {
  step: "low" | "high" | "play";
  lowHz: number | null;
  highHz: number | null;
  phrase: unknown | null | undefined;
  words: unknown[] | null | undefined;

  /** Length of the musical content to capture during RESPONSE (seconds, excludes pre-roll). */
  windowOnSec: number;
  /** Rest window (seconds). */
  windowOffSec: number;
  /** Visual/audio pre-roll before first note of the CALL (seconds). */
  preRollSec?: number;

  maxTakes: number;
  maxSessionSec: number;

  // Recorder signals (legacy single-phase support)
  isRecording: boolean;
  startedAtMs: number | null | undefined;

  // Call/Response settings
  callResponse?: boolean; // when false, behaves like legacy single-phase flow
  /** Duration of the CALL playback window (seconds, excludes pre-roll). */
  callWindowSec?: number;
  /** Invoked exactly when a CALL should begin (schedule playback here). */
  onStartCall?: () => void;

  // Callbacks
  onAdvancePhrase: () => void;
  onEnterPlay?: () => void; // e.g., resetPhraseLyrics

  /** NEW: if false, do not auto-continue after REST; user will review. */
  autoContinue?: boolean;

  /** NEW: called after REST window completes (both modes). */
  onRestComplete?: () => void;
};

type ReturnShape = {
  running: boolean;
  looping: boolean;
  loopPhase: LoopPhase;
  takeCount: number;
  shouldRecord: boolean;
  statusText: string;
  toggle: () => void;
  clearAll: () => void;
  /** Anchor for UI overlays (ms since perf.now) at the start of CALL pre-roll. */
  anchorMs: number | null;
};

export default function usePracticeLoop({
  step,
  lowHz,
  highHz,
  phrase,
  words,
  windowOnSec, // RESPONSE length only
  windowOffSec,
  preRollSec = 0,
  maxTakes,
  maxSessionSec,
  isRecording,
  startedAtMs,
  callResponse = false,
  callWindowSec = 0,
  onStartCall,
  onAdvancePhrase,
  onEnterPlay,
  autoContinue = true,
  onRestComplete,
}: Opts): ReturnShape {
  const [running, setRunning] = useState(false);
  const [looping, setLooping] = useState(false);
  const [loopPhase, setLoopPhase] = useState<LoopPhase>("idle");
  const [takeCount, setTakeCount] = useState(0);
  const [anchorMs, setAnchorMs] = useState<number | null>(null);

  const countsRef = useRef({ takeCount: 0 });
  useEffect(() => {
    countsRef.current.takeCount = takeCount;
  }, [takeCount]);

  const callTimerRef = useRef<number | null>(null);
  const recordTimerRef = useRef<number | null>(null);
  const restTimerRef = useRef<number | null>(null);
  const clearTimers = useCallback(() => {
    if (callTimerRef.current != null) {
      clearTimeout(callTimerRef.current);
      callTimerRef.current = null;
    }
    if (recordTimerRef.current != null) {
      clearTimeout(recordTimerRef.current);
      recordTimerRef.current = null;
    }
    if (restTimerRef.current != null) {
      clearTimeout(restTimerRef.current);
      restTimerRef.current = null;
    }
  }, []);

  const sessionStartMsRef = useRef<number | null>(null);

  // ✅ We only require a phrase to run. Range/words aren't required for CALL/RESPONSE.
  const hasPhrase = !!phrase;
  const canRun = step === "play" && hasPhrase;

  // reset when entering play with valid content
  useEffect(() => {
    if (!canRun) return;
    setTakeCount(0);
    clearTimers();
    setLooping(false);
    setRunning(false);
    setLoopPhase("idle");
    setAnchorMs(null);
    onEnterPlay?.();
    sessionStartMsRef.current = performance.now();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canRun]);

  const startCallPhase = useCallback(() => {
    if (!canRun) return;

    const elapsed =
      sessionStartMsRef.current != null
        ? (performance.now() - sessionStartMsRef.current) / 1000
        : 0;

    if (countsRef.current.takeCount >= maxTakes || elapsed >= maxSessionSec) {
      setLooping(false);
      setRunning(false);
      setLoopPhase("idle");
      clearTimers();
      return;
    }

    setLoopPhase("call");
    setRunning(true);

    // Establish UI anchor at the start of the CALL pre-roll.
    const SCHED_AHEAD_MS = 100; // align with AudioContext scheduling lead
    setAnchorMs(performance.now() + SCHED_AHEAD_MS);

    // Kick off the actual CALL playback if provided by caller
    onStartCall?.();

    // Transition to RESPONSE after pre-roll + callWindow
    const FRAME_MS = 16;
    const delayMs = Math.max(
      0,
      (preRollSec + Math.max(0, callWindowSec)) * 1000 + FRAME_MS
    );
    callTimerRef.current = window.setTimeout(() => {
      callTimerRef.current = null;
      setLoopPhase("record"); // RESPONSE
      setRunning(true);
    }, delayMs);
  }, [canRun, preRollSec, callWindowSec, maxTakes, maxSessionSec, clearTimers, onStartCall]);

  const startRecordPhaseLegacy = useCallback(() => {
    // Legacy single-phase flow (no explicit CALL)
    if (!canRun) return;

    const elapsed =
      sessionStartMsRef.current != null
        ? (performance.now() - sessionStartMsRef.current) / 1000
        : 0;

    if (countsRef.current.takeCount >= maxTakes || elapsed >= maxSessionSec) {
      setLooping(false);
      setRunning(false);
      setLoopPhase("idle");
      clearTimers();
      return;
    }
    // Anchor for overlay in legacy mode too
    const SCHED_AHEAD_MS = 100;
    setAnchorMs(performance.now() + SCHED_AHEAD_MS);

    setLoopPhase("record");
    setRunning(true);
  }, [canRun, maxTakes, maxSessionSec, clearTimers]);

  // exact end of RESPONSE record window
  useEffect(() => {
    if (loopPhase !== "record") {
      if (recordTimerRef.current != null) {
        clearTimeout(recordTimerRef.current);
        recordTimerRef.current = null;
      }
      return;
    }

    // Total duration to stay in "record":
    // - legacy: lead-in + phrase window
    // - call/response: response window only
    const totalMs = (callResponse ? windowOnSec : preRollSec + windowOnSec) * 1000;

    if (recordTimerRef.current == null) {
      const FRAME_MS = 16;
      // ✨ Use TRANSPORT anchor (not recorder) to measure elapsed lead-in.
      const elapsedMs = callResponse
        ? 0
        : Math.max(0, performance.now() - (anchorMs ?? performance.now()));
      const delayMs = Math.max(0, totalMs - elapsedMs + FRAME_MS);

      recordTimerRef.current = window.setTimeout(() => {
        recordTimerRef.current = null;
        setLoopPhase("rest");

        // NEW: advance phrase only if autoContinue
        if (autoContinue) onAdvancePhrase();

        setTakeCount((n) => n + 1);
      }, delayMs);
    }
  }, [loopPhase, callResponse, windowOnSec, preRollSec, anchorMs, onAdvancePhrase, autoContinue]);

  // rest -> next take (if looping) or review (if !autoContinue)
  useEffect(() => {
    if (loopPhase !== "rest") {
      if (restTimerRef.current != null) {
        clearTimeout(restTimerRef.current);
        restTimerRef.current = null;
      }
      return;
    }
    if (restTimerRef.current == null) {
      if (countsRef.current.takeCount >= maxTakes) return;
      restTimerRef.current = window.setTimeout(function tick() {
        restTimerRef.current = null;

        // signal rest complete
        onRestComplete?.();

        if (countsRef.current.takeCount >= maxTakes) {
          setLooping(false);
          setRunning(false);
          setLoopPhase("idle");
          clearTimers();
        } else if (looping && autoContinue) {
          if (callResponse) startCallPhase();
          else startRecordPhaseLegacy();
        } else {
          // Stop; upstream can present review UI
          setRunning(false);
          setLoopPhase("idle");
          setAnchorMs(null);
        }
      }, windowOffSec * 1000);
    }
  }, [
    loopPhase,
    looping,
    autoContinue,
    callResponse,
    startCallPhase,
    startRecordPhaseLegacy,
    windowOffSec,
    maxTakes,
    clearTimers,
    onRestComplete,
  ]);

  // cap guard
  useEffect(() => {
    if (takeCount >= maxTakes) {
      setLooping(false);
      setRunning(false);
      setLoopPhase("idle");
      clearTimers();
    }
  }, [takeCount, maxTakes, clearTimers]);

  // stop if we lose phrase mid-session
  useEffect(() => {
    if (!hasPhrase && looping) {
      setLooping(false);
      clearTimers();
      setRunning(false);
      setLoopPhase("idle");
    }
  }, [hasPhrase, looping, clearTimers]);

  // public controls
  const toggle = useCallback(() => {
    if (!canRun) return;
    if (!looping) {
      setLooping(true);
      clearTimers();
      if (callResponse) startCallPhase();
      else startRecordPhaseLegacy();
    } else {
      setLooping(false);
      clearTimers();
      setRunning(false);
      setLoopPhase("idle");
      setAnchorMs(null);
    }
  }, [canRun, looping, clearTimers, callResponse, startCallPhase, startRecordPhaseLegacy]);

  const clearAll = useCallback(() => {
    setLooping(false);
    clearTimers();
    setRunning(false);
    setLoopPhase("idle");
    setAnchorMs(null);
  }, [clearTimers]);

  // derived
  const shouldRecord = useMemo(() => {
    return loopPhase === "record";
  }, [loopPhase]);

  const statusText = useMemo(() => {
    if (loopPhase === "call") return "Listen…";
    if (loopPhase === "record") return "Recording…";
    if (loopPhase === "rest" && looping) return "Breather…";
    if (looping && loopPhase === "idle") return "Counting in…";
    return "Idle";
  }, [loopPhase, looping]);

  // cleanup
  useEffect(
    () => () => {
      clearTimers();
    },
    [clearTimers]
  );

  return {
    running,
    looping,
    loopPhase,
    takeCount,
    shouldRecord,
    statusText,
    toggle,
    clearAll,
    anchorMs,
  };
}
