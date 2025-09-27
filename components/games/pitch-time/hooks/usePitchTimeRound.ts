"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import useSustainPass from "@/hooks/call-response/useSustainPass";
import { midiToHz } from "@/utils/pitch/pitchMath";
import type { TakeScore } from "@/utils/scoring/score";
import { buildArpScore } from "./usePitchTimeScoring";

export type UsePitchTimeRoundArgs = {
  engaged: boolean;

  // tempo/transport
  tsNum: number;
  quarterSec: number;
  leadInSec: number;

  // audio
  playLeadInTicks: (countBeats: number, secPerBeat: number, startAtPerfMs?: number) => Promise<void> | void;
  playMidiList: (midi: number[], noteDurSec: number) => Promise<void> | void;
  stopPlayback: () => void;

  // root selection
  pickRoot: () => number | null;
  rootMidi: number | null;
  setRootMidi: (m: number | null) => void;

  // mic state
  liveHz: number | null;
  confidence: number;

  // behavior flags
  advancedUnguided?: boolean;
};

export function usePitchTimeRound({
  engaged,
  tsNum,
  quarterSec,
  leadInSec,
  playLeadInTicks,
  playMidiList,
  stopPlayback,
  pickRoot,
  rootMidi,
  setRootMidi,
  liveHz,
  confidence,
  advancedUnguided = false,
}: UsePitchTimeRoundArgs) {
  const [step, setStep] = useState<0 | 1>(0); // 0 = sustain root, 1 = arpeggio
  const [running, setRunning] = useState(false);
  const [anchorMs, setAnchorMs] = useState<number | null>(null);
  const [round, setRound] = useState(1);

  const [arpIndex, setArpIndex] = useState(0);
  const [arpCorrect, setArpCorrect] = useState(0);

  const [showReview, setShowReview] = useState(false);
  const [lastScore, setLastScore] = useState<TakeScore | undefined>(undefined);
  const [sessionScores, setSessionScores] = useState<TakeScore[]>([]);
  const [canProceed, setCanProceed] = useState(false);

  const timers = useRef<number[]>([]);
  const clearTimers = () => { timers.current.forEach(clearTimeout); timers.current = []; };

  const rootHz = useMemo(() => (rootMidi != null ? midiToHz(rootMidi, 440) : null), [rootMidi]);
  const arpSeqMidis = useMemo(() => {
    if (rootMidi == null) return [];
    return [rootMidi, rootMidi + 4, rootMidi + 7, rootMidi + 4, rootMidi];
  }, [rootMidi]);
  const arpTargetsHz = useMemo(() => arpSeqMidis.map((m) => midiToHz(m, 440)), [arpSeqMidis]);
  const currentArpHz = arpTargetsHz[arpIndex] ?? null;

  // Gates
  const rootHoldReq = Math.min(quarterSec * 0.8, 0.6);

  const gateRoot = useSustainPass({
    active: engaged && running && step === 0 && rootHz != null,
    targetHz: rootHz,
    liveHz,
    confidence,
    confMin: 0.6,
    centsTol: 45,
    holdSec: rootHoldReq,
    retryAfterSec: 6,
  });

  const gateArp = useSustainPass({
    active: engaged && running && step === 1 && currentArpHz != null,
    targetHz: currentArpHz ?? null,
    liveHz,
    confidence,
    confMin: 0.6,
    centsTol: 45,
    holdSec: rootHoldReq,
    retryAfterSec: 8,
  });

  // Calls
  const callSinglePitch = useCallback(
    async (m: number) => {
      await playMidiList([m], quarterSec);
      setRunning(true);
    },
    [playMidiList, quarterSec]
  );

  const callArpeggio = useCallback(
    async (m: number) => {
      if (!advancedUnguided) {
        await playMidiList([m, m + 4, m + 7, m + 4, m], quarterSec);
      }
      setRunning(true);
    },
    [playMidiList, quarterSec, advancedUnguided]
  );

  // Round scheduler: metronome lead-in → call → open gate
  const scheduleRound = useCallback(
    (root: number) => {
      const anchor = performance.now() + 120;
      setAnchorMs(anchor);
      playLeadInTicks(tsNum, quarterSec, anchor);

      const t1 = window.setTimeout(async () => {
        setStep(0);
        setArpIndex(0);
        setArpCorrect(0);
        await callSinglePitch(root);
      }, Math.max(0, leadInSec * 1000));
      timers.current.push(t1);
    },
    [playLeadInTicks, tsNum, quarterSec, leadInSec, callSinglePitch]
  );

  // Step 0 transitions (root sustain)
  useEffect(() => {
    if (!engaged || step !== 0 || !running || rootMidi == null) return;
    if (gateRoot.passed) {
      setRunning(false);
      const t = window.setTimeout(async () => {
        gateRoot.reset();
        setStep(1);
        setArpIndex(0);
        setArpCorrect(0);
        await callArpeggio(rootMidi);
      }, 250);
      timers.current.push(t);
    } else if (gateRoot.failed) {
      setRunning(false);
      stopPlayback();

      const s = buildArpScore({
        rootHeldSec: gateRoot.heldSec,
        rootRequiredSec: rootHoldReq,
        rootCents: gateRoot.lastCents ?? 0,
        arpCorrect: 0,
        arpTotal: 5,
      });
      setLastScore(s);
      setSessionScores((prev) => [...prev, s]);
      setCanProceed(false);
      setShowReview(true);
    }
  }, [engaged, step, running, gateRoot.passed, gateRoot.failed, gateRoot.heldSec, gateRoot.lastCents, rootMidi, callArpeggio, stopPlayback, rootHoldReq]);

  // Step 1 transitions (arpeggio)
  useEffect(() => {
    if (!engaged || step !== 1 || !running) return;
    if (gateArp.passed) {
      setArpCorrect((c) => c + 1);
      setArpIndex((i) => i + 1);
      gateArp.reset();
    } else if (gateArp.failed) {
      setRunning(false);
      stopPlayback();

      const s = buildArpScore({
        rootHeldSec: Math.min(1, gateRoot.heldSec),
        rootRequiredSec: rootHoldReq,
        rootCents: gateRoot.lastCents ?? 0,
        arpCorrect,
        arpTotal: 5,
      });
      setLastScore(s);
      setSessionScores((prev) => [...prev, s]);
      setCanProceed(false);
      setShowReview(true);
    }
  }, [engaged, step, running, gateArp.passed, gateArp.failed, gateRoot.heldSec, gateRoot.lastCents, arpCorrect, stopPlayback, rootHoldReq]);

  // Success → review (can proceed)
  useEffect(() => {
    if (!engaged) return;
    if (step === 1 && arpIndex >= 5) {
      setRunning(false);
      stopPlayback();

      const s = buildArpScore({
        rootHeldSec: gateRoot.heldSec,
        rootRequiredSec: rootHoldReq,
        rootCents: gateRoot.lastCents ?? 0,
        arpCorrect: 5,
        arpTotal: 5,
      });
      setLastScore(s);
      setSessionScores((prev) => [...prev, s]);
      setCanProceed(true);
      setShowReview(true);
    }
  }, [engaged, step, arpIndex, stopPlayback, gateRoot.heldSec, gateRoot.lastCents, rootHoldReq]);

  // Public controls
  const start = useCallback(() => {
    const root = pickRoot();
    if (root != null) {
      setRootMidi(root);
      gateRoot.reset();
      gateArp.reset();
      setShowReview(false);
      scheduleRound(root);
    }
  }, [pickRoot, setRootMidi, gateRoot, gateArp, scheduleRound]);

  const disengage = useCallback(() => {
    clearTimers();
    stopPlayback();
    setRunning(false);
    setShowReview(false);
  }, [stopPlayback]);

  const nextRound = useCallback(() => {
    if (!canProceed) return;
    setRound((n) => n + 1);
    start();
  }, [canProceed, start]);

  const retry = useCallback(() => {
    if (rootMidi == null) return;
    setShowReview(false);
    setStep(0);
    setArpIndex(0);
    setArpCorrect(0);
    gateRoot.reset();
    gateArp.reset();
    scheduleRound(rootMidi);
  }, [gateRoot, gateArp, rootMidi, scheduleRound]);

  useEffect(() => () => disengage(), [disengage]);

  return {
    // transport
    step, running, anchorMs, round,
    // arpeggio progress
    arpIndex, arpCorrect,
    // review
    showReview, lastScore, sessionScores, canProceed,
    // gates + hold requirement for UI
    gateRoot, gateArp, rootHoldReq,
    // controls
    start, disengage, nextRound, retry,
  };
}

export default usePitchTimeRound;
