"use client";
import { useEffect, useRef, useState } from "react";
import type { Phrase } from "@/utils/stage";
import type { RhythmEvent } from "@/utils/phrase/phraseTypes";
import type { TakeScore } from "@/utils/scoring/score";
import { makeOnsetsFromRhythm } from "@/utils/phrase/onsets";
import { aggregateForSubmission } from "@/utils/scoring/aggregate";
import type { LoopPhase } from "@/hooks/gameplay/usePracticeLoop";

export type TakeSnapshot = { phrase: Phrase; rhythm: RhythmEvent[] | null; melodyRhythm: RhythmEvent[] | null; };

export function useOnTakeComplete({
  active, loopPhase, phrase, rhythmEffective, melodyRhythm, bpm, den, leadInSec,
  pitchLagSec, gestureLagSec, haveRhythm, samplerSnapshot, handSnapshot,
  scoreTake, sessionScores, maxTakes, submitLesson, // submitLesson is optional
}: {
  active: boolean; loopPhase: LoopPhase; phrase: Phrase | null; rhythmEffective: RhythmEvent[] | null; melodyRhythm: RhythmEvent[] | null;
  bpm: number; den: number; leadInSec: number; pitchLagSec: number; gestureLagSec: number; haveRhythm: boolean;
  samplerSnapshot: () => any[]; handSnapshot: () => number[];
  scoreTake: (args: any) => TakeScore; sessionScores: TakeScore[]; maxTakes: number;
  submitLesson?: (payload: { takeIndex: number; score: TakeScore; snapshots: any }) => Promise<void> | void;
}) {
  const [snapshots, setSnapshots] = useState<TakeSnapshot[]>([]);
  const phraseRef = useRef<Phrase|null>(null);
  const rhythmRef = useRef<RhythmEvent[]|null>(null);
  const melodyRhythmRef = useRef<RhythmEvent[]|null>(null);
  const submittedRef = useRef(false);

  useEffect(() => {
    if (active && loopPhase === "lead-in" && phrase) {
      phraseRef.current = phrase;
      rhythmRef.current = rhythmEffective;
      melodyRhythmRef.current = melodyRhythm ?? null;
    }
  }, [active, loopPhase, phrase, rhythmEffective, melodyRhythm]);

  const prevPhaseRef = useRef(loopPhase);
  useEffect(() => {
    const prev = prevPhaseRef.current;
    const curr = loopPhase;
    prevPhaseRef.current = curr;

    if (!active || prev !== "record" || curr !== "rest") return;

    const usedPhrase = phraseRef.current ?? phrase;
    const usedRhythm = rhythmRef.current ?? rhythmEffective;
    if (!usedPhrase) return;

    const score = scoreTake({
      phrase: usedPhrase, bpm, den, leadInSec,
      pitchLagSec, gestureLagSec,
      snapshotSamples: samplerSnapshot,
      snapshotBeats: () => (haveRhythm ? handSnapshot() : []),
      melodyOnsetsSec: usedPhrase.notes.map(n => n.startSec),
      rhythmOnsetsSec: makeOnsetsFromRhythm(usedRhythm, bpm, den),
      align: undefined, // caller passes align via scoreTake wrapper if needed
    });

    const totalTakesNow = sessionScores.length + 1;
    if (totalTakesNow >= maxTakes && !submittedRef.current) {
      submittedRef.current = true;
      const all = [...sessionScores, score];
      const agg = aggregateForSubmission(all);

      const snap = {
        perTakeFinals: all.map((s, i) => ({ i, final: s.final.percent })),
        perTakePitch:  all.map((s, i) => ({ i, pct: s.pitch.percent })),
      };
      submitLesson?.({ takeIndex: totalTakesNow - 1, score: agg, snapshots: snap });
    }

    setSnapshots(xs => [...xs, { phrase: usedPhrase, rhythm: usedRhythm ?? null, melodyRhythm: melodyRhythmRef.current ?? null }]);
  }, [
    active, loopPhase, phrase, rhythmEffective, melodyRhythm,
    bpm, den, leadInSec, pitchLagSec, gestureLagSec, haveRhythm,
    samplerSnapshot, handSnapshot, scoreTake, sessionScores, maxTakes, submitLesson
  ]);

  return { snapshots };
}
