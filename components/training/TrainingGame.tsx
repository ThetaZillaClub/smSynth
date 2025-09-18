// components/training/TrainingGame.tsx
"use client";

import React, { useMemo } from "react";

import GameLayout from "./layout/GameLayout";
import TrainingSessionPanel from "./layout/session/TrainingSessionPanel";

import usePitchDetection from "@/hooks/pitch/usePitchDetection";
import usePhraseLyrics from "@/hooks/lyrics/usePhraseLyrics";
import useWavRecorder from "@/hooks/audio/useWavRecorder";
import useRecorderAutoSync from "@/hooks/audio/useRecorderAutoSync";
import useTakeProcessing from "@/hooks/audio/useTakeProcessing";
import usePracticeLoop from "@/hooks/gameplay/usePracticeLoop";
import useStudentRow from "@/hooks/students/useStudentRow";
import useStudentRange from "@/hooks/students/useStudentRange";

import { secondsPerBeat, beatsToSeconds, barsToBeats, noteValueToBeats } from "@/utils/time/tempo";
import type { Phrase } from "@/utils/piano-roll/scale";
import { type SessionConfig, DEFAULT_SESSION_CONFIG } from "./layout/session/types";
import {
  buildPhraseFromScaleWithRhythm,
  buildTwoBarRhythm,
  buildPhraseFromScaleSequence,
  sequenceNoteCountForScale,
  buildBarsRhythmForQuota,
} from "@/utils/phrase/generator";
import { makeWordLyricVariant } from "@/utils/lyrics/wordBank";

type Props = {
  title?: string;
  studentId?: string | null;
  sessionConfig?: SessionConfig;
};

const MAX_TAKES = 24;
const MAX_SESSION_SEC = 15 * 60;
const CONF_THRESHOLD = 0.5;

export default function TrainingGame({
  title = "Training",
  studentId = null,
  sessionConfig = DEFAULT_SESSION_CONFIG,
}: Props) {
  const { studentRowId, studentName, genderLabel } = useStudentRow({ studentIdFromQuery: studentId });
  const { lowHz, highHz, loading: rangeLoading, error: rangeError } = useStudentRange(studentRowId);

  // Fixed step flow now: no range capture step inside the game
  const step: "play" = "play";

  const {
    bpm, ts, leadBars, restBars,
    noteValue, noteDurSec, lyricStrategy,
    customPhrase, customWords,
    scale, rhythm,
  } = sessionConfig;

  // Transport math (lead-in derived from bars)
  const secPerBeat = secondsPerBeat(bpm, ts.den);
  const leadBeats = barsToBeats(leadBars, ts.num);
  const leadInSec = beatsToSeconds(leadBeats, bpm, ts.den);
  const restBeats = barsToBeats(restBars, ts.num);
  const restSec = beatsToSeconds(restBeats, bpm, ts.den);

  // Pitch engine
  const { pitch, confidence, isReady, error } = usePitchDetection("/models/swiftf0", {
    enabled: true,
    fps: 50,
    minDb: -45,
    smoothing: 2,
    centsTolerance: 3,
  });
  const liveHz = typeof pitch === "number" ? pitch : null;

  const usingOverrides = !!customPhrase || !!customWords;
  const haveRange = lowHz != null && highHz != null;

  // Build phrase according to rhythm config (sequence can exceed 2 bars)
  const generatedPhrase: Phrase | null = useMemo(() => {
    if (usingOverrides) return customPhrase ?? null;
    if (!haveRange || !scale || !rhythm) return null;

    const available = (rhythm as any).available?.length ? (rhythm as any).available : ["quarter"];
    const restProb = (rhythm as any).restProb ?? 0.3;
    const seed = (rhythm as any).seed ?? 0xA5F3D7;

    if ((rhythm as any).mode === "sequence") {
      const base = sequenceNoteCountForScale(scale.name);
      const want =
        ((rhythm as any).pattern === "asc-desc" || (rhythm as any).pattern === "desc-asc")
          ? (base * 2 - 1) // no double peak
          : base;

      const fabric = buildBarsRhythmForQuota({
        bpm, den: ts.den, tsNum: ts.num,
        available,
        restProb,
        seed,
        noteQuota: want,
      });

      return buildPhraseFromScaleSequence({
        lowHz: lowHz as number,
        highHz: highHz as number,
        a4Hz: 440,
        bpm, den: ts.den,
        tonicPc: scale.tonicPc,
        scale: scale.name,
        rhythm: fabric,
        pattern: (rhythm as any).pattern,
        noteQuota: want,
        seed,
      });
    } else {
      const fabric = buildTwoBarRhythm({
        bpm, den: ts.den, tsNum: ts.num,
        available,
        restProb,
        seed,
      });
      return buildPhraseFromScaleWithRhythm({
        lowHz: lowHz as number,
        highHz: highHz as number,
        a4Hz: 440,
        bpm, den: ts.den,
        tonicPc: scale.tonicPc,
        scale: scale.name,
        rhythm: fabric,
        maxPerDegree: scale.maxPerDegree ?? 2,
        seed: scale.seed ?? 0x9E3779B9,
      });
    }
  }, [usingOverrides, customPhrase, haveRange, lowHz, highHz, bpm, ts.den, ts.num, scale, rhythm]);

  // Legacy fallback (kept for safety)
  const {
    phrase: genPhraseLegacy,
    words: genWordsLegacy,
    reset: resetPhraseLyrics,
    advance: advancePhraseLyrics,
  } = usePhraseLyrics({
    lowHz: haveRange ? (lowHz as number) : null,
    highHz: haveRange ? (highHz as number) : null,
    lyricStrategy,
    a4Hz: 440,
    noteDurSec:
      typeof noteValue === "string"
        ? beatsToSeconds(noteValueToBeats(noteValue, ts.den), bpm, ts.den)
        : (noteDurSec ?? secPerBeat),
  });

  const phrase: Phrase | null = useMemo(() => {
    if (customPhrase) return customPhrase;
    if (generatedPhrase) return generatedPhrase;
    return genPhraseLegacy ?? null;
  }, [customPhrase, generatedPhrase, genPhraseLegacy]);

  const words: string[] | null = useMemo(() => {
    if (Array.isArray(customWords) && customWords.length) {
      if (phrase?.notes?.length) {
        const n = phrase.notes.length;
        const base = [...customWords.slice(0, n)];
        while (base.length < n) base.push("la");
        return base;
      }
      return customWords;
    }
    if (generatedPhrase) {
      const n = generatedPhrase.notes.length || 0;
      return makeWordLyricVariant(n, lyricStrategy, 0xABCD1234);
    }
    return genWordsLegacy ?? null;
  }, [customWords, phrase, generatedPhrase, lyricStrategy, genWordsLegacy]);

  // Recorder + loop
  const { isRecording, start: startRec, stop: stopRec, wavBlob, startedAtMs, sampleRateOut, pcm16k } =
    useWavRecorder({ sampleRateOut: 16000 });

  // Accurate phrase duration and padding
  const genNoteDurSec =
    typeof noteValue === "string"
      ? beatsToSeconds(noteValueToBeats(noteValue, ts.den), bpm, ts.den)
      : (noteDurSec ?? secPerBeat);

  const fallbackPhraseSec =
    beatsToSeconds(2 * ts.num, bpm, ts.den) ?? genNoteDurSec * 8;

  const phraseSec =
    phrase?.durationSec && Number.isFinite(phrase.durationSec)
      ? phrase.durationSec
      : fallbackPhraseSec;

  // Real end of notes (more robust than trusting durationSec blindly)
  const lastEndSec =
    phrase?.notes?.length
      ? phrase.notes.reduce((mx, n) => Math.max(mx, n.startSec + n.durSec), 0)
      : phraseSec;

  // Safety pad: ≥80ms or 15% of a beat (helps at high BPM & triplets)
  const padSec = Math.max(0.08, secPerBeat * 0.15);

  // This is the content window we want to keep (excludes pre-roll)
  const recordWindowSec = lastEndSec + padSec;

  // IMPORTANT: We still start the recorder at the beginning of the record phase,
  // so startAtMs anchors the overlay *before* the first note during pre-roll.
  const loop = usePracticeLoop({
    step,                             // now always "play"
    lowHz: haveRange ? (lowHz as number) : null,
    highHz: haveRange ? (highHz as number) : null,
    phrase,
    words,
    windowOnSec: recordWindowSec,     // record window excludes lead-in
    windowOffSec: restSec,
    preRollSec: leadInSec,            // NEW: account for pre-roll in the record-phase timeout
    maxTakes: MAX_TAKES,
    maxSessionSec: MAX_SESSION_SEC,
    isRecording,
    startedAtMs: startedAtMs ?? null,
    onAdvancePhrase: usingOverrides ? () => {} : generatedPhrase ? () => {} : advancePhraseLyrics,
    onEnterPlay: usingOverrides ? () => {} : generatedPhrase ? () => {} : resetPhraseLyrics,
  });

  useRecorderAutoSync({
    enabled: step === "play",
    shouldRecord: loop.shouldRecord,  // starts at beginning of record phase (pre-roll + phrase)
    isRecording,
    startRec,
    stopRec,
  });

  useTakeProcessing({
    wavBlob,
    sampleRateOut,
    pcm16k,
    windowOnSec: recordWindowSec,     // export just the content window (pre-roll is visual)
    trimHeadSec: 0,                   // recorder already spans pre-roll; exports content
    onTakeReady: ({ exactBlob, exactSamples }) => {
      console.log("[musicianship] take ready", {
        studentRowId,
        studentName,
        genderLabel,
        bpm,
        ts: `${ts.num}/${ts.den}`,
        leadBars,
        restBars,
        exportSeconds: recordWindowSec,
        restSeconds: restSec,
        sampleRateOut: sampleRateOut || 16000,
        exactSamples,
        wavBytesRaw: (wavBlob as Blob)?.size,
        wavBytesExact: exactBlob.size,
      });
    },
  });

  const showLyrics = step === "play" && !!words?.length;
  const startMs = isRecording ? startedAtMs ?? null : null;

  // UI-only messaging when range is missing
  const readinessError =
    rangeError
      ? `Range load failed: ${rangeError}`
      : !rangeLoading && !haveRange
        ? "No saved range found. Please set your vocal range first."
        : null;

  return (
    <GameLayout
      title={title}
      error={error || readinessError}
      running={loop.running && haveRange && !!phrase}
      onToggle={loop.toggle}
      phrase={phrase ?? undefined}
      lyrics={showLyrics ? words ?? undefined : undefined}
      livePitchHz={liveHz}
      confidence={confidence}
      confThreshold={CONF_THRESHOLD}
      startAtMs={startMs}
      leadInSec={leadInSec}
      isReady={isReady && haveRange && !!phrase}
      step={step}
      loopPhase={loop.loopPhase}
    >
      {/* Session panel and stats remain; if range is missing we still show transport info */}
      {haveRange && phrase && (
        <TrainingSessionPanel
          statusText={loop.statusText}
          isRecording={isRecording}
          startedAtMs={startedAtMs ?? null}
          recordSec={leadInSec + recordWindowSec} // show the full record phase (pre-roll + content)
          restSec={restSec}
          maxTakes={MAX_TAKES}
          maxSessionSec={MAX_SESSION_SEC}
          bpm={bpm}
          ts={ts}
          leadBars={leadBars}
          restBars={restBars}
        />
      )}
    </GameLayout>
  );
}
