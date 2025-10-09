"use client";

import React, { useCallback, useState } from "react";
import GameLayout from "@/components/training/layout/GameLayout";
import usePitchDetection from "@/hooks/pitch/usePitchDetection";
import useStudentRange from "@/hooks/students/useStudentRange";
import usePhrasePlayer from "@/hooks/audio/usePhrasePlayer";
import { DEFAULT_SESSION_CONFIG } from "@/components/training/session";

import TakeReview from "@/components/training/layout/stage/side-panel/TakeReview";

import { usePitchTimeRoot } from "./hooks/usePitchTimeRoot";
import { usePitchTimePhrase } from "./hooks/usePitchTimePhrase";
import { usePitchTimeRound } from "./hooks/usePitchTimeRound";

type Props = {
  studentId?: string | null;
  studentRowId?: string | null;
  studentName?: string | null;
  rangeLowLabel?: string | null;
  rangeHighLabel?: string | null;
  advancedUnguided?: boolean;
};

export default function PitchTimeGame({
  studentRowId = null,
  rangeLowLabel = null,
  rangeHighLabel = null,
  studentName,
  advancedUnguided = false,
}: Props) {
  const { lowHz, highHz, loading, error } = useStudentRange(studentRowId, {
    rangeLowLabel,
    rangeHighLabel,
  });

  // 🔊 Mic armed before Start
  const [engaged, setEngaged] = useState(false);
  const {
    pitch: liveHzRaw,
    confidence,
    isReady,
    error: micError,
  } = usePitchDetection("/models/swiftf0", {
    enabled: true,
    fps: 50,
    minDb: -45,
    smoothing: 2,
  });
  const liveHz = typeof liveHzRaw === "number" ? liveHzRaw : null;

  const bpm = DEFAULT_SESSION_CONFIG.bpm;
  const ts = DEFAULT_SESSION_CONFIG.ts;
  const leadInSec = (ts.num * 60) / bpm;

  // Root selection / preload
  const { rootMidi, setRootMidi, pickRoot, rootLabel } = usePitchTimeRoot({
    lowHz,
    highHz,
    engaged,
    preload: true,
  });

  // Staff phrase + derived timings
  const { phrase, seqMidis, quarterSec } = usePitchTimePhrase({ rootMidi, bpm });

  // Audio helpers
  const { playMidiList, playLeadInTicks, stop: stopPlayback } = usePhrasePlayer();

  // Round orchestration (lead-in → call(s) → gates → review)
  const round = usePitchTimeRound({
    engaged,
    tsNum: ts.num,
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
    advancedUnguided,
  });

  // Header Start/Pause
  const onToggle = useCallback(() => {
    setEngaged((e) => {
      const next = !e;
      if (!next) {
        round.disengage();
      } else if (!loading && lowHz != null && highHz != null) {
        round.start();
      }
      return next;
    });
  }, [round, loading, lowHz, highHz]);

  const statusText = (() => {
    if (micError || error) return "Mic/range error";
    if (loading || !isReady || lowHz == null || highHz == null) return "Loading…";
    if (!engaged) return "Press Start";
    return round.step === 0
      ? (round.running ? "Sing the starting note" : "Listen…")
      : round.running
      ? "Sing the arpeggio (do–mi–sol–mi–do)"
      : advancedUnguided
      ? "Prepare (unguided)…"
      : "Listen…";
  })();

  return (
    <GameLayout
      title={`Pitch Time ${studentName ? "— " + studentName : ""}`}
      error={micError || error}
      running={engaged && !!phrase}
      uiRunning={engaged}
      onToggle={onToggle}
      phrase={phrase ?? undefined}
      livePitchHz={liveHz}
      confidence={confidence}
      isReady={isReady}
      startAtMs={round.anchorMs}
      leadInSec={leadInSec}
      step="play"
      loopPhase={round.running ? "record" : engaged ? "call" : "idle"}
      keySig={null}
      view="piano"
      clef={null}
      lowHz={lowHz}
      highHz={highHz}
    >
      <div className="mt-2 rounded-lg border border-[#d2d2d2] bg-[#ebebeb] p-3">
        <div className="flex items-center justify-between">
          <div className="text-sm">
            <span className="font-semibold">{statusText}</span>
            <span className="ml-2 text-xs text-[#2d2d2d]">
              Root {rootLabel} • Round {round.round}
            </span>
          </div>
          {round.step === 1 && round.running ? (
            <div className="text-xs">Arpeggio step {round.arpIndex + 1} / 5</div>
          ) : null}
        </div>

        {round.step === 0 && engaged && round.running ? (
          <div className="mt-1 text-xs">
            Hold the root for {round.rootHoldReq.toFixed(2)}s • held{" "}
            {Math.min(round.gateRoot.heldSec, round.rootHoldReq).toFixed(2)}s
            {round.gateRoot.lastCents != null && (
              <span className="ml-2">({round.gateRoot.lastCents}¢)</span>
            )}
          </div>
        ) : null}

        {round.step === 1 && engaged && round.running ? (
          <div className="mt-1 text-xs">
            Target {round.arpIndex + 1}: held {round.gateArp.heldSec.toFixed(2)}s
            {round.gateArp.lastCents != null && (
              <span className="ml-2">({round.gateArp.lastCents}¢)</span>
            )}
          </div>
        ) : null}
      </div>

      {round.showReview && (
        <TakeReview
          haveRhythm={true}
          onPlayMelody={() => {
            if (!seqMidis.length) return;
            return playMidiList(seqMidis, quarterSec);
          }}
          onPlayRhythm={() => {}}
          onPlayBoth={() => {
            if (!seqMidis.length) return;
            return playMidiList(seqMidis, quarterSec);
          }}
          onStop={stopPlayback}
          score={round.lastScore}
          phrase={phrase ?? null}
          bpm={bpm}
          den={ts.den}
          tonicPc={DEFAULT_SESSION_CONFIG.scale?.tonicPc ?? 0}
        />
      )}
    </GameLayout>
  );
}
