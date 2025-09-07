"use client";

import React, { useMemo, useState } from "react";
import PianoRollCanvas from "@/components/piano-roll/PianoRollCanvas";
import usePitchDetection from "@/hooks/usePitchDetection";
import { hzToNoteName } from "@/utils/pitch";

function buildDemoPhrase() {
  // 2 bars ~4s (8 notes × 0.5s) C4→C5
  const midiSeq = [60, 62, 64, 65, 67, 69, 71, 72];
  const dur = 0.5;
  const notes = midiSeq.map((midi, i) => ({ midi, startSec: i * dur, durSec: dur }));
  return { durationSec: midiSeq.length * dur, notes };
}

export default function Training() {
  const [running, setRunning] = useState(false);
  const phrase = useMemo(buildDemoPhrase, []);

  const { pitch, confidence, isReady, error } = usePitchDetection("/models/swiftf0", {
    enabled: running,
    fps: 60,
    minDb: -45,
    smoothing: 2,
    centsTolerance: 3,
  }) as {
    pitch: number | null;
    confidence: number;
    isReady: boolean;
    error: string | null;
  }; // TS: explicit type for JS hook

  const pitchText = (typeof pitch === "number") ? `${pitch.toFixed(1)} Hz` : "—";
  const noteText = (typeof pitch === "number")
    ? (() => {
        const { name, octave, cents } = hzToNoteName(pitch, 440, { useSharps: true });
        const sign = cents > 0 ? "+" : "";
        return `${name}${octave} ${sign}${cents}¢`;
      })()
    : "—";

  return (
    <main className="min-h-screen flex flex-col items-center justify-start gap-6 bg-[#0e0f12] text-white p-6">
      <div className="w-full max-w-5xl flex items-center justify-between gap-4">
        <h1 className="text-3xl font-semibold">Training</h1>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setRunning(r => !r)}
            className={`px-4 py-2 rounded-lg font-medium ${running ? "bg-red-500 hover:bg-red-600" : "bg-emerald-500 hover:bg-emerald-600"}`}
          >
            {running ? "Stop" : "Start"}
          </button>
          <div className="text-sm opacity-80">
            {error ? <span className="text-red-400">Mic error: {String(error)}</span> :
              <span>{isReady ? "Mic ready" : running ? "Starting mic…" : "Mic idle"}</span>}
          </div>
        </div>
      </div>

      <div className="w-full max-w-5xl">
        <PianoRollCanvas
          width={960}
          height={280}
          phrase={phrase}
          running={running}
          livePitchHz={typeof pitch === "number" ? pitch : null}
          confidence={confidence ?? 0}
          confThreshold={0.5}
          a4Hz={440}
        />
      </div>

      <div className="w-full max-w-5xl grid grid-cols-3 gap-4 text-sm">
        <div className="bg-white/5 rounded-lg p-4">
          <div className="opacity-70">Live Pitch</div>
          <div className="text-xl font-mono">{pitchText}</div>
        </div>
        <div className="bg-white/5 rounded-lg p-4">
          <div className="opacity-70">Note (A440)</div>
          <div className="text-xl font-mono">{noteText}</div>
        </div>
        <div className="bg-white/5 rounded-lg p-4">
          <div className="opacity-70">Confidence</div>
          <div className="text-xl font-mono">{(confidence ?? 0).toFixed(2)}</div>
        </div>
      </div>

      <p className="max-w-3xl text-center text-white/70">
        Tip: sing the ascending C major scale (C4→C5). The yellow line shows detected pitch; the red dot is the latest point.
        Try to keep the dot centered on each blue block.
      </p>
    </main>
  );
}
