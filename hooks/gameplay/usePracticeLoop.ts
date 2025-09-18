// hooks/gameplay/usePracticeLoop.ts
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export type LoopPhase = "idle" | "record" | "rest";

type Opts = {
  step: "low" | "high" | "play";
  lowHz: number | null;
  highHz: number | null;
  phrase: unknown | null | undefined;
  words: unknown[] | null | undefined;

  /** Length of the musical content to capture (seconds, excludes pre-roll). */
  windowOnSec: number;
  /** Rest window (seconds). */
  windowOffSec: number;
  /** Visual/audio pre-roll before first note (seconds). */
  preRollSec?: number;

  maxTakes: number;
  maxSessionSec: number;

  // Recorder signals
  isRecording: boolean;
  startedAtMs: number | null | undefined;

  // Callbacks
  onAdvancePhrase: () => void;
  onEnterPlay?: () => void; // e.g., resetPhraseLyrics
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
};

export default function usePracticeLoop({
  step,
  lowHz,
  highHz,
  phrase,
  words,
  windowOnSec,
  windowOffSec,
  preRollSec = 0,
  maxTakes,
  maxSessionSec,
  isRecording,
  startedAtMs,
  onAdvancePhrase,
  onEnterPlay,
}: Opts): ReturnShape {
  const [running, setRunning] = useState(false);
  const [looping, setLooping] = useState(false);
  const [loopPhase, setLoopPhase] = useState<LoopPhase>("idle");
  const [takeCount, setTakeCount] = useState(0);

  const countsRef = useRef({ takeCount: 0 });
  useEffect(() => { countsRef.current.takeCount = takeCount; }, [takeCount]);

  const recordTimerRef = useRef<number | null>(null);
  const restTimerRef = useRef<number | null>(null);
  const clearTimers = useCallback(() => {
    if (recordTimerRef.current != null) { clearTimeout(recordTimerRef.current); recordTimerRef.current = null; }
    if (restTimerRef.current != null) { clearTimeout(restTimerRef.current); restTimerRef.current = null; }
  }, []);

  const sessionStartMsRef = useRef<number | null>(null);
  const canPlay = step === "play" && lowHz != null && highHz != null;
  const hasPhrase = !!phrase && !!words;

  // reset when entering play with valid bounds
  useEffect(() => {
    if (!canPlay) return;
    setTakeCount(0);
    clearTimers();
    setLooping(false);
    setRunning(false);
    setLoopPhase("idle");
    onEnterPlay?.();
    sessionStartMsRef.current = performance.now();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canPlay]);

  const startRecordPhase = useCallback(() => {
    if (!canPlay || !hasPhrase) return;

    const elapsed =
      sessionStartMsRef.current ? (performance.now() - sessionStartMsRef.current) / 1000 : 0;

    if (countsRef.current.takeCount >= maxTakes || elapsed >= maxSessionSec) {
      setLooping(false);
      setRunning(false);
      setLoopPhase("idle");
      clearTimers();
      return;
    }
    setLoopPhase("record");
    setRunning(true);
  }, [canPlay, hasPhrase, maxTakes, maxSessionSec, clearTimers]);

  // exact end of record window (pre-roll + content)
  useEffect(() => {
    if (loopPhase !== "record") {
      if (recordTimerRef.current != null) { clearTimeout(recordTimerRef.current); recordTimerRef.current = null; }
      return;
    }
    if (isRecording && startedAtMs != null && recordTimerRef.current == null) {
      const now = performance.now();
      const elapsedMs = now - startedAtMs;
      // include pre-roll *and* phrase window; add small frame cushion
      const FRAME_MS = 16;
      const totalMs = (preRollSec + windowOnSec) * 1000;
      const delayMs = Math.max(0, totalMs - elapsedMs + FRAME_MS);

      recordTimerRef.current = window.setTimeout(() => {
        setRunning(false);
        setLoopPhase("rest");
        onAdvancePhrase();
        setTakeCount((n) => n + 1);
      }, delayMs);
    }
  }, [loopPhase, isRecording, startedAtMs, windowOnSec, preRollSec, onAdvancePhrase]);

  // rest -> next take (if looping)
  useEffect(() => {
    if (loopPhase !== "rest" || !looping) {
      if (restTimerRef.current != null) { clearTimeout(restTimerRef.current); restTimerRef.current = null; }
      return;
    }
    if (!isRecording && restTimerRef.current == null) {
      if (countsRef.current.takeCount >= maxTakes) return;
      restTimerRef.current = window.setTimeout(function tick() {
        restTimerRef.current = null;
        if (countsRef.current.takeCount >= maxTakes) {
          setLooping(false);
          setRunning(false);
          setLoopPhase("idle");
          clearTimers();
        } else {
          startRecordPhase();
        }
      }, windowOffSec * 1000);
    }
  }, [loopPhase, looping, isRecording, startRecordPhase, windowOffSec, maxTakes, clearTimers]);

  // cap guard
  useEffect(() => {
    if (takeCount >= maxTakes) {
      setLooping(false);
      setRunning(false);
      setLoopPhase("idle");
      clearTimers();
    }
  }, [takeCount, maxTakes, clearTimers]);

  // stop if cannot play
  useEffect(() => {
    if (!canPlay) {
      if (looping) {
        setLooping(false);
        clearTimers();
        setRunning(false);
        setLoopPhase("idle");
      }
    }
  }, [canPlay, looping, clearTimers]);

  // public controls
  const toggle = useCallback(() => {
    if (!canPlay) return;
    if (!looping) {
      setLooping(true);
      clearTimers();
      startRecordPhase();
    } else {
      setLooping(false);
      clearTimers();
      setRunning(false);
      setLoopPhase("idle");
    }
  }, [canPlay, looping, clearTimers, startRecordPhase]);

  const clearAll = useCallback(() => {
    setLooping(false);
    clearTimers();
    setRunning(false);
    setLoopPhase("idle");
  }, [clearTimers]);

  // derived
  const statusText = useMemo(() => {
    return loopPhase === "record"
      ? (isRecording ? "Recording…" : "Playing…")
      : loopPhase === "rest" && looping
      ? "Breather…"
      : "Idle";
  }, [loopPhase, looping, isRecording]);

  // cleanup
  useEffect(() => () => { clearTimers(); }, [clearTimers]);

  return {
    running,
    looping,
    loopPhase,
    takeCount,
    shouldRecord: running,
    statusText,
    toggle,
    clearAll,
  };
}
