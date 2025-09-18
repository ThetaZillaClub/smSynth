// components/training/TrainingCurriculum.tsx
"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  DEFAULT_SESSION_CONFIG,
  type SessionConfig,
} from "./layout/session/types";
import type { Phrase } from "@/utils/piano-roll/scale";
import { parseMidiToPhraseAndLyrics } from "@/utils/midi/smf";
import useStudentRow from "@/hooks/students/useStudentRow";
import useStudentRange from "@/hooks/students/useStudentRange";
import { hzToMidi, midiToNoteName } from "@/utils/pitch/pitchMath";

import TransportCard from "./curriculum-layout/TransportCard/TransportCard";
import ScaleRhythmCard from "./curriculum-layout/ScaleRhythm/ScaleRhythmCard";
import ImportMidiCard from "./curriculum-layout/ImportMidi/ImportMidiCard";
import AdvancedOverridesCard from "./curriculum-layout/AdvancedOverrides/AdvancedOverridesCard";
import CustomLyricsCard from "./curriculum-layout/CustomLyrics/CustomLyricsCard";
import Field from "./curriculum-layout/Field";

function safeParsePhrase(s: string): Phrase | null {
  try {
    const v = JSON.parse(s);
    if (v && Array.isArray(v.notes) && typeof v.durationSec === "number") return v as Phrase;
  } catch {}
  return null;
}

export default function TrainingCurriculum({
  onStart,
  defaultConfig,
}: {
  onStart: (cfg: SessionConfig) => void;
  defaultConfig?: Partial<SessionConfig>;
}) {
  const init = useMemo<SessionConfig>(
    () => ({ ...DEFAULT_SESSION_CONFIG, ...(defaultConfig || {}) }),
    [defaultConfig]
  );
  const [cfg, setCfg] = useState<SessionConfig>(init);

  const [phraseJson, setPhraseJson] = useState(
    cfg.customPhrase ? JSON.stringify(cfg.customPhrase, null, 2) : ""
  );
  const [customLyrics, setCustomLyrics] = useState(
    Array.isArray(cfg.customWords) ? cfg.customWords.join(", ") : ""
  );

  // who
  const { studentRowId } = useStudentRow({ studentIdFromQuery: null });
  const { lowHz, highHz } = useStudentRange(studentRowId);
  const haveRange = lowHz != null && highHz != null;

  // allowed tonics (need ≥ 1 octave inside [low..high])
  const allowedTonicPcs = useMemo<Set<number>>(() => {
    if (!haveRange) return new Set<number>();
    const loM = Math.round(hzToMidi(lowHz as number));
    const hiM = Math.round(hzToMidi(highHz as number));
    const maxTonic = hiM - 12;
    if (maxTonic < loM) return new Set<number>();
    const set = new Set<number>();
    for (let m = loM; m <= maxTonic; m++) set.add(((m % 12) + 12) % 12);
    return set;
  }, [haveRange, lowHz, highHz]);

  // autocorrect tonic if now invalid
  useEffect(() => {
    if (!haveRange) return;
    const currentPc = (cfg.scale?.tonicPc ?? 0) % 12;
    if (allowedTonicPcs.has(((currentPc % 12) + 12) % 12)) return;
    if (allowedTonicPcs.size === 0) return;

    const loM = Math.round(hzToMidi(lowHz as number));
    const hiM = Math.round(hzToMidi(highHz as number));
    const mid = Math.round((loM + (hiM - 12)) / 2);
    let bestPc = 0, bestDist = Infinity;

    allowedTonicPcs.forEach((pc) => {
      let bestForPc = Infinity;
      for (let m = loM; m <= hiM - 12; m++) {
        if ((((m % 12) + 12) % 12) === pc) {
          const d = Math.abs(m - mid);
          if (d < bestForPc) bestForPc = d;
        }
      }
      if (bestForPc < bestDist) { bestDist = bestForPc; bestPc = pc; }
    });

    setCfg((c) => ({ ...c, scale: { ...(c.scale ?? { name: "major" }), tonicPc: bestPc } as any }));
  }, [haveRange, allowedTonicPcs, lowHz, highHz, cfg.scale]);

  // range hint text
  const rangeHint = useMemo(() => {
    if (!haveRange) return null;
    const loM = Math.round(hzToMidi(lowHz as number));
    const hiM = Math.round(hzToMidi(highHz as number));
    const loName = midiToNoteName(loM, { useSharps: true });
    const hiName = midiToNoteName(hiM, { useSharps: true });
    const allowedLabels = Array.from(allowedTonicPcs)
      .sort((a, b) => a - b)
      .map((pc) => ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"][pc])
      .join(", ");
    return {
      lo: `${loName.name}${loName.octave}`,
      hi: `${hiName.name}${hiName.octave}`,
      list: allowedLabels,
      none: allowedTonicPcs.size === 0,
    };
  }, [haveRange, lowHz, highHz, allowedTonicPcs]);

  // simple typed setter
  const pushChange = useCallback((patch: Partial<SessionConfig>) => {
    setCfg((c) => ({ ...c, ...patch }));
  }, []);

  const launch = useCallback(() => {
    const p = phraseJson.trim() ? safeParsePhrase(phraseJson.trim()) : cfg.customPhrase ?? null;
    const w =
      customLyrics.trim()
        ? customLyrics.split(",").map((s) => s.trim()).filter(Boolean)
        : cfg.customWords ?? null;

    onStart({ ...cfg, customPhrase: p, customWords: w });
  }, [cfg, onStart, phraseJson, customLyrics]);

  const onMidiFile = useCallback(async (file: File) => {
    const buf = await file.arrayBuffer();
    try {
      const { phrase, lyrics } = parseMidiToPhraseAndLyrics(buf);
      setCfg((c) => ({ ...c, customPhrase: phrase, customWords: lyrics }));
      setPhraseJson(JSON.stringify(phrase, null, 2));
      setCustomLyrics(lyrics.join(", "));
    } catch (e) {
      alert("Failed to parse MIDI: " + (e as Error)?.message);
    }
  }, []);

  return (
    <div className="min-h-dvh h-dvh flex flex-col bg-gradient-to-b from-[#f0f0f0] to-[#d2d2d2] text-[#0f0f0f]">
      {/* Header */}
      <div className="w-full flex justify-center pt-4 px-6 pb-2">
        <div className="w-full max-w-7xl">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Training — Curriculum</h1>
          <p className="text-sm text-[#2d2d2d] mt-1">
            Configure this session. These settings apply only to the game you launch now.
          </p>
        </div>
      </div>

      {/* Body */}
      <div className="w-full flex-1 flex flex-col gap-4 min-h-0 px-6 pb-6">
        <div className="w-full max-w-7xl mx-auto mt-2">
          <TransportCard
            bpm={cfg.bpm}
            ts={cfg.ts}
            leadBars={cfg.leadBars}
            restBars={cfg.restBars}
            onChange={pushChange}
          />
        </div>

        <div className="w-full max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-3">
          <ScaleRhythmCard
            cfg={cfg}
            onChange={pushChange}
            allowedTonicPcs={allowedTonicPcs}
            rangeHint={rangeHint}
          />
          <ImportMidiCard
            hasPhrase={!!cfg.customPhrase}
            onClear={() => {
              setCfg((c) => ({ ...c, customPhrase: null, customWords: null }));
              setPhraseJson("");
              setCustomLyrics("");
            }}
            onFile={onMidiFile}
          />
        </div>

        {/* Overrides */}
        <div className="w-full max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-3">
          <AdvancedOverridesCard
            phraseJson={phraseJson}
            setPhraseJson={setPhraseJson}
          />
          <CustomLyricsCard
            value={customLyrics}
            onChange={setCustomLyrics}
          />
        </div>

        <div className="w-full max-w-7xl mx-auto">
          <button
            type="button"
            onClick={launch}
            className="px-4 py-2 rounded-md border border-[#d2d2d2] bg-[#f0f0f0] text-[#0f0f0f] text-sm hover:bg-white transition shadow-sm"
            title="Begin session"
          >
            Start session →
          </button>
        </div>
      </div>
    </div>
  );
}
