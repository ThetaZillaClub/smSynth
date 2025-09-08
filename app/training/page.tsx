"use client";

import React, { useMemo, useState, useEffect } from "react";
import GameLayout from "@/components/game-layout/GameLayout";
import RangeCapture from "@/components/game-layout/range/RangeCapture";
import usePitchDetection from "@/hooks/usePitchDetection";
import { hzToNoteName, hzToMidi } from "@/utils/pitch/pitchMath";
import type { Phrase } from "@/components/piano-roll/PianoRollCanvas";

type Step = "low" | "high" | "play";

const SOLFEGE = ["do", "re", "mi", "fa", "sol", "la", "ti", "do"] as const;
const MAJOR_OFFSETS = [0, 2, 4, 5, 7, 9, 11, 12]; // semitones

function buildPhraseFromRangeDiatonic(lowHz: number, highHz: number, a4Hz = 440): Phrase {
  const low = Math.round(hzToMidi(lowHz, a4Hz));
  const high = Math.round(hzToMidi(highHz, a4Hz));
  const a = Math.min(low, high);
  const b = Math.max(low, high);
  const span = b - a;

  const dur = 0.5; // 8 notes => 4s window
  let mids: number[] = [];

  if (span >= 12) {
    // fit a full octave inside detected range
    const startMidi = Math.max(a, b - 12);
    mids = MAJOR_OFFSETS.map((off) => startMidi + off);
  } else {
    // not enough room for 12 semitones — compress to available span
    mids = MAJOR_OFFSETS.map((off) => {
      const ratio = off / 12;
      return Math.round(a + ratio * span);
    });
  }

  const notes = mids.map((m, i) => ({
    midi: m,
    startSec: i * dur,
    durSec: dur,
  }));

  return { durationSec: notes.length * dur, notes };
}

export default function Training() {
  const [step, setStep] = useState<Step>("low");
  const [lowHz, setLowHz] = useState<number | null>(null);
  const [highHz, setHighHz] = useState<number | null>(null);

  // mic always on (range + play)
  const { pitch, confidence, isReady, error } = usePitchDetection("/models/swiftf0", {
    enabled: true,
    fps: 60,
    minDb: -45,
    smoothing: 2,
    centsTolerance: 3,
  });

  // play/scroll state
  const [running, setRunning] = useState(false);
  const [activeWord, setActiveWord] = useState<number>(-1);

  // stop scrolling unless we're in play
  useEffect(() => {
    if (step !== "play") setRunning(false);
  }, [step]);

  const pitchText = typeof pitch === "number" ? `${pitch.toFixed(1)} Hz` : "—";
  const noteText =
    typeof pitch === "number"
      ? (() => {
          const { name, octave, cents } = hzToNoteName(pitch, 440, { useSharps: true });
          const sign = cents > 0 ? "+" : "";
          return `${name}${octave} ${sign}${cents}¢`;
        })()
      : "—";

  const micText = error ? `Mic error: ${String(error)}` : isReady ? "Mic ready" : "Starting mic…";

  const phrase: Phrase | null = useMemo(() => {
    if (step === "play" && lowHz != null && highHz != null) {
      return buildPhraseFromRangeDiatonic(lowHz, highHz, 440);
    }
    return null;
  }, [step, lowHz, highHz]);

  return (
    <GameLayout
      title="Training"
      micText={micText}
      error={error}
      // play controls
      running={running}
      onToggle={() => setRunning((r) => !r)}
      // stage & lyrics (only show lyrics in play)
      phrase={phrase}
      lyrics={step === "play" ? (SOLFEGE as unknown as string[]) : undefined}
      activeLyricIndex={step === "play" ? activeWord : -1}
      onActiveNoteChange={(idx) => setActiveWord(idx)}
      // bottom stats
      pitchText={pitchText}
      noteText={noteText}
      confidence={confidence}
      // live pitch for the roll overlay
      livePitchHz={typeof pitch === "number" ? pitch : null}
      confThreshold={0.5}
    >
      {step === "low" && (
        <RangeCapture
          mode="low"
          active
          pitchHz={typeof pitch === "number" ? pitch : null}
          confidence={confidence}
          confThreshold={0.5}
          bpm={60}
          beatsRequired={1}
          centsWindow={75}
          a4Hz={440}
          onConfirm={(hz) => {
            setLowHz(hz);
            setStep("high");
          }}
        />
      )}

      {step === "high" && (
        <RangeCapture
          mode="high"
          active
          pitchHz={typeof pitch === "number" ? pitch : null}
          confidence={confidence}
          confThreshold={0.5}
          bpm={60}
          beatsRequired={1}
          centsWindow={75}
          a4Hz={440}
          onConfirm={(hz) => {
            setHighHz(hz);
            setStep("play");
            setRunning(false); // ensure user must click Start
          }}
        />
      )}
    </GameLayout>
  );
}
