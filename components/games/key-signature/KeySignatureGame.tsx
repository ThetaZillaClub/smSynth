"use client";

import React, { useCallback, useMemo, useState } from "react";
import GameLayout from "@/components/training/layout/GameLayout";
import usePitchDetection from "@/hooks/pitch/usePitchDetection";
import useStudentRange from "@/hooks/students/useStudentRange";
import usePhrasePlayer from "@/hooks/audio/usePhrasePlayer";
import { midiToNoteName } from "@/utils/pitch/pitchMath";
import { DEFAULT_SESSION_CONFIG } from "@/components/training/session";
import type { NoteValue } from "@/utils/time/tempo";
import { noteValueToSeconds } from "@/utils/time/tempo";
import { useKeySignatureKey } from "./hooks/useKeySignatureKey";
import { useKeySignaturePhrase } from "./hooks/useKeySignaturePhrase";
import { useTonicGate } from "./hooks/useTonicGate";
import { useKeySignatureRound } from "./hooks/useKeySignatureRound";

type Props = {
  studentId?: string | null;
  studentRowId?: string | null;
  studentName?: string | null;
  rangeLowLabel?: string | null;
  rangeHighLabel?: string | null;
};

/** A440 → derive tonic, sing tonic. Random major key within range. 3 bars, staff view. */
export default function KeySignatureGame({
  studentRowId = null,
  rangeLowLabel = null,
  rangeHighLabel = null,
  studentName,
}: Props) {
  const { lowHz, highHz, loading, error } = useStudentRange(studentRowId, {
    rangeLowLabel,
    rangeHighLabel,
  });

  const { playA440, playMidiList, stop: stopPlayback } = usePhrasePlayer();

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
  const eighthSec = noteValueToSeconds("eighth" as NoteValue, bpm, DEFAULT_SESSION_CONFIG.ts.den);

  // --- Tonic & key selection
  const {
    tonicPc,
    tonicMidi,
    setTonicPc,
    setTonicMidi,
    keyName,
    targetHz,
    chooseRandomKey,
  } = useKeySignatureKey({ lowHz, highHz, engaged, preload: true });

  // --- Phrase for staff context
  const { phrase } = useKeySignaturePhrase({
    lowHz,
    highHz,
    tonicPc,
    bpm,
    tsNum: DEFAULT_SESSION_CONFIG.ts.num,
    den: DEFAULT_SESSION_CONFIG.ts.den,
    bars: 3,
  });

  // --- Gate for tonic sustain
  const gate = useTonicGate({
    engaged,
    running: false, // placeholder; overridden by round.hook below via spread
    targetHz,
    liveHz,
    confidence,
    bpm,
    tsDen: DEFAULT_SESSION_CONFIG.ts.den,
  });

  // --- Round orchestration (A440 → open gate → pass/fail handling)
  const round = useKeySignatureRound({
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
  });

  // we need gate.active to track round.running; re-create with correct flag:
  const gameGate = useTonicGate({
    engaged,
    running: round.running,
    targetHz,
    liveHz,
    confidence,
    bpm,
    tsDen: DEFAULT_SESSION_CONFIG.ts.den,
    // reuse defaults for conf/cents/hold/retry
  });

  // Status text + labels
  const targetLabel = useMemo(() => {
    if (tonicMidi == null) return "—";
    const n = midiToNoteName(tonicMidi, { useSharps: true });
    return `${n.name}${n.octave}`;
  }, [tonicMidi]);

  const onToggle = useCallback(() => {
    setEngaged((e) => {
      const next = !e;
      if (!next) {
        round.disengage();
      } else if (!loading && lowHz != null && highHz != null) {
        gameGate.reset();
        void round.startRound();
      }
      return next;
    });
  }, [round, gameGate, loading, lowHz, highHz]);

  return (
    <GameLayout
      title={`Key Signature ${studentName ? "— " + studentName : ""}`}
      error={micError || error}
      running={engaged && !!phrase}
      uiRunning={engaged}
      onToggle={onToggle}
      phrase={phrase ?? undefined}
      livePitchHz={liveHz}
      confidence={confidence}
      isReady={isReady}
      startAtMs={round.anchorMs}
      leadInSec={0}
      step="play"
      loopPhase={round.running ? "record" : engaged ? "call" : "idle"}
      keySig={keyName}
      view="sheet"
      clef={null}
      lowHz={lowHz}
      highHz={highHz}
    >
      <div className="mt-2 rounded-lg border border-[#d2d2d2] bg-[#ebebeb] p-3">
        <div className="flex items-center justify-between">
          <div className="text-sm">
            <span className="font-semibold">
              {!engaged
                ? "Press Start"
                : loading || !isReady
                ? "Loading…"
                : round.running
                ? "Sing the tonic"
                : "Listen…"}
            </span>
            {engaged && round.running && (
              <span className="ml-2 text-xs text-[#2d2d2d]">
                Key {keyName ?? "—"} • Target {targetLabel} • held {gameGate.heldSec.toFixed(2)}s
                {gameGate.lastCents != null && <span className="ml-2">({gameGate.lastCents}¢)</span>}
              </span>
            )}
          </div>
          <div className="text-xs">Round {round.round}</div>
        </div>
        {gameGate.failed ? (
          <div className="mt-2 text-sm">
            Didn’t lock onto tonic. Replaying A440 and target {targetLabel}…
          </div>
        ) : null}
      </div>
    </GameLayout>
  );
}
