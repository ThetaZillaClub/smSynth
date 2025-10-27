// hooks/gameplay/useScoringLifecycle.ts
"use client";

import { useEffect, useRef, useState } from "react";
import type { Phrase } from "@/utils/stage";
import type { RhythmEvent } from "@/utils/phrase/phraseTypes";
import { makeOnsetsFromRhythm } from "@/utils/phrase/onsets";
import { aggregateForSubmission } from "@/utils/scoring/aggregate";
import type { TakeScore, PitchSample } from "@/utils/scoring/score";
import type { ScoringAlignmentOptions } from "@/hooks/gameplay/useScoringAlignment";

const DEV = process.env.NODE_ENV !== "production";
const log = (...args: any[]) => { if (DEV) console.debug(...args); };
const group = (label: string) => { if (DEV && console.groupCollapsed) console.groupCollapsed(label); };
const groupEnd = () => { if (DEV && console.groupEnd) console.groupEnd(); };

export type AlignFn = (
  samplesRaw: PitchSample[] | null | undefined,
  beatsRaw: number[] | null | undefined,
  leadInSec: number | null | undefined,
  opts?: ScoringAlignmentOptions
) => { samples: PitchSample[]; beats: number[] };

/** Keep arg name `rhythmOnsetsSec` – useTakeScoring expects this. */
type ScoreTakeFn = (args: {
  phrase: Phrase;
  bpm: number;
  den: number;
  leadInSec: number;
  pitchLagSec: number;
  gestureLagSec: number;
  snapshotSamples: () => PitchSample[];
  snapshotBeats: () => number[];
  melodyOnsetsSec: number[];
  rhythmOnsetsSec?: number[] | null;
  align: AlignFn;
  phraseLengthOverrideSec?: number;
  optionsOverride?: {
    confMin?: number;
    centsOk?: number;
    onsetGraceMs?: number;
    maxAlignMs?: number;
    goodAlignMs?: number;
  };
  minHoldSec?: number;
}) => TakeScore;

export type TakeSnapshot = {
  phrase: Phrase;
  rhythm: RhythmEvent[] | null;
  melodyRhythm: RhythmEvent[] | null;
};

type HandLike = { snapshotEvents: () => number[] };

export function useScoringLifecycle({
  loopPhase,
  pretestActive,
  phrase,
  rhythmEffective,
  melodyRhythm,
  bpm,
  den,
  leadInSec,
  calibratedLatencyMs,
  gestureLatencyMs,
  exerciseLoops,
  lessonSlug,
  sessionId,
  sessionScores,
  scoreTake,
  alignForScoring,
  sampler,
  hand,
  haveRhythm,
  timingFreeResponse = false,
  freeCaptureSec,
  freeMinHoldSec,
}: {
  loopPhase: string;
  pretestActive: boolean;
  phrase: Phrase | null;
  rhythmEffective: RhythmEvent[] | null;
  melodyRhythm: RhythmEvent[] | null;
  bpm: number;
  den: number;
  leadInSec: number;
  calibratedLatencyMs: number | null;
  gestureLatencyMs: number;
  exerciseLoops: number | null | undefined;
  lessonSlug: string | null | undefined;
  sessionId: string | null | undefined;
  sessionScores: TakeScore[];
  scoreTake: ScoreTakeFn;
  alignForScoring: AlignFn;
  sampler: { snapshot: () => PitchSample[] };
  hand: HandLike;
  haveRhythm: boolean;
  timingFreeResponse?: boolean;
  freeCaptureSec?: number;
  freeMinHoldSec?: number;
}) {
  const [takeSnapshots, setTakeSnapshots] = useState<TakeSnapshot[]>([]);

  const phraseForTakeRef = useRef<Phrase | null>(null);
  const rhythmForTakeRef = useRef<RhythmEvent[] | null>(null);
  const melodyRhythmForTakeRef = useRef<RhythmEvent[] | null>(null);
  const sessionSubmittedRef = useRef(false);

  // Freeze exercise at lead-in
  useEffect(() => {
    if (!pretestActive && loopPhase === "lead-in" && phrase) {
      phraseForTakeRef.current = phrase;
      rhythmForTakeRef.current = rhythmEffective;
      melodyRhythmForTakeRef.current = melodyRhythm ?? null;
      log("[score:lifecycle] froze content at lead-in", {
        phraseNotes: phrase?.notes?.length ?? 0,
        rhythmEvents: rhythmEffective?.length ?? 0,
        melodyRhythmEvents: melodyRhythm?.length ?? 0,
      });
    }
  }, [pretestActive, loopPhase, phrase, rhythmEffective, melodyRhythm]);

  const postAggregate = async (score: TakeScore) => {
    if (!lessonSlug) return;
    try {
      await fetch(`/api/lessons/${lessonSlug}/results`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          sessionId: sessionId ?? null,
          takeIndex: null,
          scoreVersion: 2,
          isAggregate: true,
          score,
          snapshots: undefined,
          visibility: {
            showPitch: true,
            showIntervals: true,
            showMelodyRhythm: !timingFreeResponse,
            showRhythmLine: !timingFreeResponse && haveRhythm,
          },
        }),
      });
    } catch {
      /* best effort */
    }
  };

  // Record → Rest: compute score
  const prevPhaseRef = useRef(loopPhase);
  useEffect(() => {
    const prev = prevPhaseRef.current;
    prevPhaseRef.current = loopPhase;

    if (!pretestActive && prev === "record" && loopPhase === "rest") {
      const usedPhrase = phraseForTakeRef.current ?? phrase;
      const usedRhythm = rhythmForTakeRef.current ?? rhythmEffective;
      if (!usedPhrase) return;

      const pitchLagSec = 0.02;

      // Hand-tap detector subtracts latency at commit-time → avoid double-compensation.
      const gestureLagFromSettings = ((calibratedLatencyMs ?? gestureLatencyMs) || 0) / 1000;
      const usingVisionBeats = !timingFreeResponse && haveRhythm;
      const gestureLagSec = usingVisionBeats ? 0 : gestureLagFromSettings;

      const snapshotBeats =
        timingFreeResponse ? () => [0] : () => (haveRhythm ? hand.snapshotEvents() : []);

      const melodyOnsets = timingFreeResponse ? [0] : usedPhrase.notes.map((n) => n.startSec);

      const rhythmOnsets =
        timingFreeResponse ? undefined : makeOnsetsFromRhythm(usedRhythm, bpm, den);

      const optionsOverride = timingFreeResponse
        ? { confMin: 0.5, centsOk: 80, onsetGraceMs: 160 }
        : undefined;

      // ─── pre-score debug ────────────────────────────────────────────────
      const beatsPreview = snapshotBeats();
      const fmt = (xs?: number[] | null, k = 5) =>
        (xs ?? []).slice(0, k).map((x) => (Number.isFinite(x) ? +x.toFixed(3) : x));
      const takeIndex = sessionScores.length;
      group(
        `[score] take #${takeIndex + 1} ${timingFreeResponse ? "timing-free" : "timed"} ${
          usingVisionBeats ? "vision-beats" : "no-beats"
        }`
      );
      log("inputs", {
        bpm, den, leadInSec,
        timingFreeResponse,
        haveRhythm,
        usingVisionBeats,
        calibratedLatencyMs,
        gestureLatencyMs,
        gestureLagFromSettings,
        gestureLagSec,
        pitchLagSec,
        phraseNotes: usedPhrase.notes.length,
        rhythmOnsetsCount: rhythmOnsets?.length ?? 0,
        beatsCapturedCount: beatsPreview.length,
        melodyOnsetsCount: melodyOnsets.length,
        freeCaptureSec,
        freeMinHoldSec,
      });
      log("arrays.head", {
        beatsCaptured_first: fmt(beatsPreview),
        rhythmOnsets_first: fmt(rhythmOnsets ?? []),
        melodyOnsets_first: fmt(melodyOnsets),
      });
      if (usingVisionBeats && gestureLagFromSettings !== 0) {
        console.warn(
          "[score] using vision beats → forcing gestureLagSec=0 to avoid double-compensation",
          { gestureLagFromSettings }
        );
      }
      // ───────────────────────────────────────────────────────────────────

      const score = scoreTake({
        phrase: usedPhrase,
        bpm,
        den,
        leadInSec,
        pitchLagSec,
        gestureLagSec, // ← zero when using hand beats to prevent double-offset
        snapshotSamples: () => sampler.snapshot(),
        snapshotBeats,
        melodyOnsetsSec: melodyOnsets,
        rhythmOnsetsSec: rhythmOnsets, // keep as array; scorer handles undefined for timing-free
        align: alignForScoring,
        phraseLengthOverrideSec:
          timingFreeResponse && typeof freeCaptureSec === "number" && freeCaptureSec > 0
            ? freeCaptureSec
            : undefined,
        optionsOverride,
        // Only pass minHoldSec when actually timing-free and meaningful (> 0)
        minHoldSec:
          timingFreeResponse &&
          typeof freeMinHoldSec === "number" &&
          freeMinHoldSec > 0
            ? freeMinHoldSec
            : undefined,
      });

      // ─── attach rhythm-line meta so UI can explain "why" ────────────────
      const expectedBeatsCount = rhythmOnsets?.length ?? 0;
      const capturedBeatsCount = beatsPreview.length;

      const skippedReason =
        score.rhythm.lineEvaluated ? null
        : timingFreeResponse ? "timing_free"
        : !haveRhythm ? "line_disabled"
        : expectedBeatsCount === 0 ? "no_expected_onsets"
        : capturedBeatsCount === 0 ? "no_taps_captured"
        : "scorer_missing_onsets"; // both present but scorer couldn't evaluate

      (score as any).__rhythmLine = {
        skippedReason,
        expectedBeatsCount,
        capturedBeatsCount,
        usingVisionBeats,
        timingFree: !!timingFreeResponse,
        haveRhythm: !!haveRhythm,
        // extra breadcrumbs for anchor/count-in debugging
        leadInSec,
      };

      // ─── post-score debug ───────────────────────────────────────────────
      try {
        const lp = score.rhythm.linePerEvent ?? [];
        const hits = lp.filter((e) => e.hit).length;
        const preview = lp.slice(0, 6).map((e) => ({
          idx: e.idx,
          exp: +e.expSec.toFixed(3),
          tap: e.tapSec == null ? null : +e.tapSec.toFixed(3),
          errMs: e.errMs == null ? null : Math.round(e.errMs),
          credit: +e.credit.toFixed(3),
          hit: e.hit,
        }));
        log("score.final", score.final);
        log("score.pitch", {
          percent: score.pitch.percent,
          timeOnPitchRatio: score.pitch.timeOnPitchRatio,
          centsMae: score.pitch.centsMae,
          perNote: score.pitch.perNote?.length ?? 0,
        });
        log("score.rhythm.summary", {
          combinedPercent: score.rhythm.combinedPercent,
          melodyPercent: score.rhythm.melodyPercent,
          melodyHitRate: score.rhythm.melodyHitRate,
          melodyMeanAbsMs: score.rhythm.melodyMeanAbsMs,
          lineEvaluated: score.rhythm.lineEvaluated,
          linePercent: score.rhythm.linePercent,
          lineHitRate: score.rhythm.lineHitRate,
          lineMeanAbsMs: score.rhythm.lineMeanAbsMs,
          expectedBeats: expectedBeatsCount,
          capturedBeats: capturedBeatsCount,
          matchedHits: hits,
          skippedReason,
        });
        log("score.rhythm.linePerEvent.head", preview);
      } catch {}
      groupEnd();
      // ───────────────────────────────────────────────────────────────────

      // Keep the evaluation phrase for analytics (timing-free may alter it)
      const phraseForSnapshots = ((score as any).__evalPhrase ?? usedPhrase)!;
      setTakeSnapshots((xs) => [
        ...xs,
        {
          phrase: phraseForSnapshots,
          rhythm: usedRhythm ?? null,
          melodyRhythm: melodyRhythmForTakeRef.current ?? null,
        },
      ]);

      const loops =
        typeof exerciseLoops === "number" && Number.isFinite(exerciseLoops) && exerciseLoops > 0
          ? exerciseLoops
          : null;

      const totalTakesNow = sessionScores.length + 1;
      if (lessonSlug && loops != null && totalTakesNow >= loops && !sessionSubmittedRef.current) {
        sessionSubmittedRef.current = true;
        const allScores = [...sessionScores, score];
        const aggScore = aggregateForSubmission(allScores);
        void postAggregate(aggScore);
      }
    }
  }, [
    loopPhase,
    pretestActive,
    phrase,
    rhythmEffective,
    bpm,
    den,
    leadInSec,
    calibratedLatencyMs,
    gestureLatencyMs,
    exerciseLoops,
    lessonSlug,
    sessionId,
    sessionScores,
    scoreTake,
    alignForScoring,
    sampler,
    hand,
    haveRhythm,
    timingFreeResponse,
    freeCaptureSec,
    freeMinHoldSec,
  ]);

  return { takeSnapshots };
}
