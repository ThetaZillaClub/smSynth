// hooks/gameplay/useOnTakeComplete.ts
"use client";
import { useEffect, useRef, useState } from "react";
import type { Phrase } from "@/utils/stage";
import type { RhythmEvent } from "@/utils/phrase/phraseTypes";
import type { TakeScore } from "@/utils/scoring/score";
import { makeOnsetsFromRhythm } from "@/utils/phrase/onsets";
import { aggregateForSubmission } from "@/utils/scoring/aggregate";
import type { LoopPhase } from "@/hooks/gameplay/usePracticeLoop";

export type TakeSnapshot = {
  phrase: Phrase;
  rhythm: RhythmEvent[] | null;
  melodyRhythm: RhythmEvent[] | null;
};

// Note-labeler for melody coverage (unchanged behavior)
function makeSecondsToNoteLabel(bpm: number, den: number) {
  const beatSec = 60 / Math.max(1, bpm);
  const quarterSec = beatSec * (4 / Math.max(1, den));
  const candidates: Array<{ sec: number; name: string }> = [
    { sec: quarterSec * 4, name: "Whole" },
    { sec: quarterSec * 2, name: "Half" },
    { sec: quarterSec * 1, name: "Quarter" },
    { sec: quarterSec * 0.5, name: "Eighth" },
    { sec: quarterSec * 0.25, name: "Sixteenth" },
    { sec: quarterSec * 0.125, name: "Thirty-second" },
  ];
  return (sec: number) => {
    if (!Number.isFinite(sec) || sec <= 0) return undefined;
    let best = candidates[0];
    let bestErr = Math.abs(sec - best.sec) / best.sec;
    for (let i = 1; i < candidates.length; i++) {
      const c = candidates[i];
      const rel = Math.abs(sec - c.sec) / c.sec;
      if (rel < bestErr) { best = c; bestErr = rel; }
    }
    return bestErr <= 0.25 ? best.name : "Other";
  };
}

// NEW: beat-labeler for rhythm-line rollups — only accept true beats
function makeSecondsToBeatLabel(bpm: number, den: number) {
  const beatSec = 60 / Math.max(1, bpm); // true beat duration
  const baseLabel = den === 4 ? "Quarter" : "Beat";
  return (sec: number) => {
    if (!Number.isFinite(sec) || sec <= 0) return undefined;
    const ratio = sec / beatSec;
    return Math.abs(ratio - 1) <= 0.25 ? baseLabel : undefined; // skip non-beats
  };
}

export function useOnTakeComplete({
  active,
  loopPhase,
  phrase,
  rhythmEffective,
  melodyRhythm,
  bpm,
  den,
  leadInSec,
  pitchLagSec,
  gestureLagSec,
  haveRhythm,
  samplerSnapshot,
  handSnapshot,
  scoreTake,
  sessionScores,
  maxTakes,
  submitLesson, // submitLesson is optional
  visibility,   // ⬅️ NEW
}: {
  active: boolean;
  loopPhase: LoopPhase;
  phrase: Phrase | null;
  rhythmEffective: RhythmEvent[] | null;
  melodyRhythm: RhythmEvent[] | null;
  bpm: number;
  den: number;
  leadInSec: number;
  pitchLagSec: number;
  gestureLagSec: number;
  haveRhythm: boolean;
  samplerSnapshot: () => any[];
  handSnapshot: () => number[];
  scoreTake: (args: any) => TakeScore;
  sessionScores: TakeScore[];
  maxTakes: number;
  submitLesson?: (payload: {
    takeIndex: number;
    score: TakeScore;
    snapshots: any;
  }) => Promise<void> | void;
  visibility?: {
    showMelodyRhythm?: boolean;
    showRhythmLine?: boolean;
    showIntervals?: boolean;
    showPitch?: boolean;
  };
}) {
  const [snapshots, setSnapshots] = useState<TakeSnapshot[]>([]);
  const phraseRef = useRef<Phrase | null>(null);
  const rhythmRef = useRef<RhythmEvent[] | null>(null);
  const melodyRhythmRef = useRef<RhythmEvent[] | null>(null);
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
      phrase: usedPhrase,
      bpm,
      den,
      leadInSec,
      pitchLagSec,
      gestureLagSec,
      snapshotSamples: samplerSnapshot,
      snapshotBeats: () => (haveRhythm ? handSnapshot() : []),
      melodyOnsetsSec: usedPhrase.notes.map((n) => n.startSec),
      rhythmOnsetsSec: makeOnsetsFromRhythm(usedRhythm, bpm, den),
      align: undefined, // caller passes align via scoreTake wrapper if needed
    });

    const totalTakesNow = sessionScores.length + 1;
    if (totalTakesNow >= maxTakes && !submittedRef.current) {
      submittedRef.current = true;
      const all = [...sessionScores, score];

      // Build expected-onsets per take
      const prevOnsets = snapshots.map((s) =>
        s.rhythm ? makeOnsetsFromRhythm(s.rhythm, bpm, den) : []
      );
      const currOnsets = usedRhythm ? makeOnsetsFromRhythm(usedRhythm, bpm, den) : [];
      const onsetsByTake = [...prevOnsets, currOnsets];

      // Labelers
      const melodyNoteLabel = makeSecondsToNoteLabel(bpm, den);
      const beatLabel = makeSecondsToBeatLabel(bpm, den);

      const melodyLabelFromSeconds = (sec: number) => melodyNoteLabel(sec);
      const lineLabelByEvent = (takeIdx: number, ev: { idx: number; expSec: number }) => {
        const arr = onsetsByTake[takeIdx] ?? [];
        if (!arr.length) return undefined;
        const i = ev.idx;
        const next = i + 1 < arr.length ? arr[i + 1] : null;
        const prev = i - 1 >= 0 ? arr[i] - arr[i - 1] : null;
        const ioi = next != null ? next - arr[i] : prev != null ? prev : null;
        return ioi && ioi > 0 ? beatLabel(ioi) : undefined; // only accept true beats
      };

      // ⬇️ VISIBILITY-AWARE SUBMISSION AGGREGATE (+labels)
      const agg = aggregateForSubmission(all, visibility, {
        melodyLabelFromSeconds,
        lineLabelByEvent,
        onsetGraceSec: 0.12,
      });

      const snap = {
        perTakeFinals: all.map((s, i) => ({ i, final: s.final.percent })),
        perTakePitch: all.map((s, i) => ({ i, pct: s.pitch.percent })),
      };
      submitLesson?.({ takeIndex: totalTakesNow - 1, score: agg, snapshots: snap });
    }

    setSnapshots((xs) => [
      ...xs,
      {
        phrase: usedPhrase,
        rhythm: usedRhythm ?? null,
        melodyRhythm: melodyRhythmRef.current ?? null,
      },
    ]);
  }, [
    active,
    loopPhase,
    phrase,
    rhythmEffective,
    melodyRhythm,
    bpm,
    den,
    leadInSec,
    pitchLagSec,
    gestureLagSec,
    haveRhythm,
    samplerSnapshot,
    handSnapshot,
    scoreTake,
    sessionScores,
    maxTakes,
    submitLesson,
    visibility, // ⬅️ include in deps so changes apply to the terminal aggregate
    snapshots,
  ]);

  return { snapshots };
}
