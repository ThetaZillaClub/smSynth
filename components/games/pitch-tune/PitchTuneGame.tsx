"use client";

import React, { useCallback, useState } from "react";
import GameLayout from "@/components/training/layout/GameLayout";
import usePitchDetection from "@/hooks/pitch/usePitchDetection";
import useStudentRange from "@/hooks/students/useStudentRange";
import usePhrasePlayer from "@/hooks/audio/usePhrasePlayer";
import { DEFAULT_SESSION_CONFIG } from "@/components/training/session";
import TakeReview from "@/components/training/layout/stage/side-panel/TakeReview";
import usePitchTuneDurations from "./hooks/usePitchTuneDurations";
import { usePitchTuneTarget } from "./hooks/usePitchTuneTarget";
import { usePitchTunePhrase } from "./hooks/usePitchTunePhrase";
import { usePitchTuneRound } from "./hooks/usePitchTuneRound";

type Props = {
  studentId?: string | null;
  studentRowId?: string | null;
  studentName?: string | null;
  rangeLowLabel?: string | null;
  rangeHighLabel?: string | null;
};

export default function PitchTuneGame({
  studentRowId = null,
  rangeLowLabel = null,
  rangeHighLabel = null,
  studentName,
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

  const { quarterSec, leadInSec, requiredHoldSec } = usePitchTuneDurations({
    bpm,
    tsNum: ts.num,
  });

  // Target selection / preload
  const { targetMidi, setTargetMidi, pickRandomTarget, targetHz, targetLabel } =
    usePitchTuneTarget({ lowHz, highHz, engaged, preload: true });

  // Stage phrase
  const { phrase } = usePitchTunePhrase({ targetMidi, requiredHoldSec });

  // Audio helpers
  const { playMidiList, stop: stopPlayback } = usePhrasePlayer();

  // Round orchestration
  const round = usePitchTuneRound({
    engaged,
    quarterSec,
    leadInSec,
    requiredHoldSec,
    playMidiList,
    stopPlayback,
    pickRandomTarget,
    targetMidi,
    setTargetMidi,
    targetHz,
    liveHz,
    confidence,
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
    return round.running ? "Sing and hold the target" : "Listen…";
  })();

  return (
    <GameLayout
      title={`Pitch Tune ${studentName ? "— " + studentName : ""}`}
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
              Target {targetLabel} • Round {round.round}
            </span>
          </div>
        </div>

        {engaged && round.running ? (
          <div className="mt-1 text-xs">
            Hold for {round.requiredHoldSec.toFixed(2)}s • held{" "}
            {Math.min(round.gate.heldSec, round.requiredHoldSec).toFixed(2)}s
            {round.gate.lastCents != null && (
              <span className="ml-2">({round.gate.lastCents}¢)</span>
            )}
          </div>
        ) : null}
      </div>

      {round.showReview && (
        <TakeReview
          haveRhythm={false}
          onPlayMelody={() => {
            if (targetMidi == null) return;
            return playMidiList(targetMidi != null ? [targetMidi] : [], Math.min(quarterSec, requiredHoldSec));
          }}
          onPlayRhythm={() => {}}
          onPlayBoth={() => {
            if (targetMidi == null) return;
            return playMidiList([targetMidi], Math.min(quarterSec, requiredHoldSec));
          }}
          onStop={stopPlayback}
          onNext={round.nextRound}
          score={round.lastScore}
          sessionScores={round.sessionScores}
          canProceed={round.canProceed}
          onRetry={round.retry}
        />
      )}
    </GameLayout>
  );
}
