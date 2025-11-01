// hooks/gameplay/useOnTakeComplete.ts
"use client";
import { useEffect, useRef, useState } from "react";
import type { Phrase } from "@/utils/stage";
import type { RhythmEvent } from "@/utils/phrase/phraseTypes";
import type { TakeScore } from "@/utils/scoring/score";
import { aggregateForSubmission } from "@/utils/scoring/aggregate";
import type { LoopPhase } from "@/hooks/gameplay/usePracticeLoop";

export type TakeSnapshot = {
  phrase: Phrase;
  rhythm: RhythmEvent[] | null;
  melodyRhythm: RhythmEvent[] | null;
};

/** ─────────────────────────── Helpers ─────────────────────────── */

function noteValueToUiName(v: unknown): string | undefined {
  if (typeof v !== "string" || !v) return undefined;
  const s = v.replace(/-/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** NOTE-only labels from fabric.value; indices align with linePerEvent.idx */
function fabricNoteLabels(rhythm: RhythmEvent[] | null | undefined): string[] {
  if (!Array.isArray(rhythm)) return [];
  const labels: string[] = [];
  for (const ev of rhythm) {
    if ((ev as any)?.type === "note") {
      labels.push(noteValueToUiName((ev as any)?.value) ?? "");
    }
  }
  return labels;
}

/** ─────────────────────────── Hook ─────────────────────────── */

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
  submitLesson,
  visibility,
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
      // rhythmOnsetsSec now unused for labeling; scoring still gets its own linePerEvent from scoreTake
      rhythmOnsetsSec: [],
      align: undefined,
    });

    const totalTakesNow = sessionScores.length + 1;

    if (totalTakesNow >= maxTakes && !submittedRef.current) {
      submittedRef.current = true;
      const all = [...sessionScores, score];

      // Fabric-first NOTE labels for the blue line (index == linePerEvent.idx)
      const prevLineLabels = snapshots.map((s) => fabricNoteLabels(s.rhythm));
      const currLineLabels = fabricNoteLabels(usedRhythm);
      const lineLabelsByTake = [...prevLineLabels, currLineLabels];

      // Melody labels: prefer melodyRhythm.value, fallback to rhythm.value
      const prevMelodyLabels = snapshots.map((s) =>
        fabricNoteLabels(s.melodyRhythm ?? s.rhythm)
      );
      const currMelodyLabels = fabricNoteLabels(melodyRhythmRef.current ?? usedRhythm);
      const melodyLabelsByTake = [...prevMelodyLabels, currMelodyLabels];

      const agg = aggregateForSubmission(all, visibility, {
        // Use fabric labeling by note index; ignore raw `sec`
        melodyLabelFromSeconds: (_sec: number, noteIdx?: number, takeIdx?: number) => {
          if (takeIdx == null || noteIdx == null) return "All";
          const arr = melodyLabelsByTake[takeIdx] ?? [];
          const lbl = arr[noteIdx] ?? "";
          return lbl || "All";
        },
        lineLabelByEvent: (takeIdx: number, ev: { idx: number }) => {
          const arr = lineLabelsByTake[takeIdx] ?? [];
          const lbl = arr[ev.idx] ?? "";
          // undefined → skip from rollup; avoids junk buckets
          return lbl || undefined;
        },
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
    visibility,
    snapshots,
  ]);

  return { snapshots };
}
