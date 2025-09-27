"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { SustainPassState } from "@/hooks/call-response/useSustainPass";

export type UseKeySignatureRoundArgs = {
  engaged: boolean;
  lowHz: number | null;
  highHz: number | null;
  chooseRandomKey: () => { pc: number | null; m: number | null };
  setTonicPc: (pc: number | null) => void;
  setTonicMidi: (m: number | null) => void;
  tonicMidi: number | null;

  gate: SustainPassState;

  playA440: (durSec?: number) => Promise<void> | void;
  playMidiList: (midi: number[], noteDurSec: number) => Promise<void> | void;
  stopPlayback: () => void;
};

export function useKeySignatureRound({
  engaged,
  lowHz,
  highHz,
  chooseRandomKey,
  setTonicPc,
  setTonicMidi,
  tonicMidi,
  gate,
  playA440,
  playMidiList,
  stopPlayback,
}: UseKeySignatureRoundArgs) {
  const [running, setRunning] = useState(false);
  const [anchorMs, setAnchorMs] = useState<number | null>(null);
  const [round, setRound] = useState(1);

  const timers = useRef<number[]>([]);
  const clearTimers = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  }, []);

  const startRound = useCallback(async () => {
    if (lowHz == null || highHz == null) return;
    const { pc, m } = chooseRandomKey();
    setTonicPc(pc);
    setTonicMidi(m);
    setAnchorMs(performance.now() + 100);
    await playA440(0.5);
    setRunning(true);
  }, [lowHz, highHz, chooseRandomKey, setTonicPc, setTonicMidi, playA440]);

  // Handle pass/fail
  useEffect(() => {
    if (!engaged || !running || tonicMidi == null) return;

    if (gate.passed) {
      setRunning(false);
      stopPlayback();
      const t = window.setTimeout(() => {
        setRound((n) => n + 1);
        gate.reset();
        if (engaged) void startRound();
      }, 500);
      timers.current.push(t);
    } else if (gate.failed) {
      setRunning(false);
      stopPlayback();
      const t = window.setTimeout(async () => {
        gate.reset();
        await playA440(0.5);
        await playMidiList([tonicMidi], 0.5);
        setAnchorMs(performance.now() + 100);
        if (engaged) setRunning(true);
      }, 300);
      timers.current.push(t);
    }
  }, [engaged, running, tonicMidi, gate, startRound, playA440, playMidiList, stopPlayback]);

  const disengage = useCallback(() => {
    clearTimers();
    stopPlayback();
    setRunning(false);
  }, [clearTimers, stopPlayback]);

  useEffect(() => () => disengage(), [disengage]);

  return { running, anchorMs, round, startRound, disengage };
}

export default useKeySignatureRound;
