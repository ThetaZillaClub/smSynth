// components/training/TrainingCurriculum.tsx
"use client";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { DEFAULT_SESSION_CONFIG, type SessionConfig } from "./session";
import type { Phrase } from "@/utils/stage";
import { parseMidiToPhraseAndLyrics } from "@/utils/midi/smf";
import useStudentRange from "@/hooks/students/useStudentRange";
import { hzToMidi, midiToNoteName } from "@/utils/pitch/pitchMath";
import TransportCard from "./curriculum-layout/TransportCard/TransportCard";
import ImportMidiCard from "./curriculum-layout/ImportMidi/ImportMidiCard";
import AdvancedOverridesCard from "./curriculum-layout/AdvancedOverrides/AdvancedOverridesCard";
import CustomLyricsCard from "./curriculum-layout/CustomLyrics/CustomLyricsCard";
import ViewSelectCard from "./curriculum-layout/ViewSelect/ViewSelectCard";
import SequenceModeCard from "./curriculum-layout/SequenceMode/SequenceModeCard";
import ScaleCard from "./curriculum-layout/Scale/ScaleCard";
import RhythmCard from "./curriculum-layout/Rhythm/RhythmCard";
import CallResponseCard from "./curriculum-layout/CallResponse/CallResponseCard";

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
  rangeLowLabel,
  rangeHighLabel,
}: {
  onStart: (cfg: SessionConfig) => void;
  defaultConfig?: Partial<SessionConfig>;
  rangeLowLabel?: string | null;
  rangeHighLabel?: string | null;
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

  const { lowHz, highHz } = useStudentRange(null, {
    rangeLowLabel: rangeLowLabel ?? null,
    rangeHighLabel: rangeHighLabel ?? null,
  });

  const haveRange = lowHz != null && highHz != null;

  const PC_LABELS_FLAT = useMemo(
    () => ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"],
    []
  );

  const allowedTonicPcs = useMemo<Set<number>>(() => {
    if (!haveRange) return new Set<number>();
    const loM = Math.round(hzToMidi(lowHz as number));
    const hiM = Math.round(hzToMidi(highHz as number));
    const maxTonic = hiM - 12; // need at least an octave above tonic
    if (maxTonic < loM) return new Set<number>();
    const set = new Set<number>();
    for (let m = loM; m <= maxTonic; m++) set.add(((m % 12) + 12) % 12);
    return set;
  }, [haveRange, lowHz, highHz]);

  // Nudge tonic into allowed set if out-of-range
  useEffect(() => {
    if (!haveRange) return;
    const currentPc = (cfg.scale?.tonicPc ?? 0) % 12;
    if (allowedTonicPcs.has(((currentPc % 12) + 12) % 12)) return;
    if (allowedTonicPcs.size === 0) return;

    const loM = Math.round(hzToMidi(lowHz as number));
    const hiM = Math.round(hzToMidi(highHz as number));
    const mid = Math.round((loM + (hiM - 12)) / 2);

    let bestPc = 0,
      bestDist = Infinity;
    allowedTonicPcs.forEach((pc) => {
      let bestForPc = Infinity;
      for (let m = loM; m <= hiM - 12; m++) {
        if ((((m % 12) + 12) % 12) === pc) {
          const d = Math.abs(m - mid);
          if (d < bestForPc) bestForPc = d;
        }
      }
      if (bestForPc < bestDist) {
        bestDist = bestForPc;
        bestPc = pc;
      }
    });

    setCfg((c) => ({
      ...c,
      scale: { ...(c.scale ?? { name: "major" }), tonicPc: bestPc } as any,
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [haveRange, allowedTonicPcs, lowHz, highHz]);

  const rangeHint = useMemo(() => {
    if (!haveRange) return null;
    const loM = Math.round(hzToMidi(lowHz as number));
    const hiM = Math.round(hzToMidi(highHz as number));
    const loName = midiToNoteName(loM, { useSharps: true });
    const hiName = midiToNoteName(hiM, { useSharps: true });
    const allowedLabels = Array.from(allowedTonicPcs)
      .sort((a, b) => a - b)
      .map((pc) => PC_LABELS_FLAT[pc])
      .join(", ");
    return {
      lo: `${loName.name}${loName.octave}`,
      hi: `${hiName.name}${hiName.octave}`,
      list: allowedLabels,
      none: allowedTonicPcs.size === 0,
    };
  }, [haveRange, lowHz, highHz, allowedTonicPcs, PC_LABELS_FLAT]);

  const pushChange = useCallback((patch: Partial<SessionConfig>) => {
    setCfg((c) => ({ ...c, ...patch }));
  }, []);

  const launch = useCallback(() => {
    const p = phraseJson.trim() ? safeParsePhrase(phraseJson.trim()) : cfg.customPhrase ?? null;
    const w = customLyrics.trim()
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
        <div className="w-full max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-3 mt-2">
          <div className="flex flex-col gap-3">
            <TransportCard
              bpm={cfg.bpm}
              ts={cfg.ts}
              leadBars={cfg.leadBars}
              restBars={cfg.restBars}
              exerciseLoops={cfg.exerciseLoops}
              regenerateBetweenTakes={cfg.regenerateBetweenTakes}
              metronome={cfg.metronome}
              onChange={pushChange}
            />

            {/* Split cards: Exercise Mode, then Scale and Rhythm */}
            <SequenceModeCard cfg={cfg} onChange={pushChange} />
            <ScaleCard
              cfg={cfg}
              onChange={pushChange}
              allowedTonicPcs={allowedTonicPcs}
              rangeHint={rangeHint}
            />
            <RhythmCard cfg={cfg} onChange={pushChange} />
          </div>

          <div className="flex flex-col gap-3">
            <ViewSelectCard value={cfg.view} onChange={pushChange} />

            <ImportMidiCard
              hasPhrase={!!cfg.customPhrase}
              onClear={() => {
                setCfg((c) => ({ ...c, customPhrase: null, customWords: null }));
                setPhraseJson("");
                setCustomLyrics("");
              }}
              onFile={onMidiFile}
            />

            <AdvancedOverridesCard phraseJson={phraseJson} setPhraseJson={setPhraseJson} />
            <CustomLyricsCard value={customLyrics} onChange={setCustomLyrics} />
            <CallResponseCard cfg={cfg} onChange={pushChange} />
          </div>
        </div>

        {/* Start */}
        <div className="w-full max-w-7xl mx-auto flex justify-center pt-1">
          <button
            type="button"
            onClick={launch}
            className="px-3 py-1.5 rounded-md border border-[#d2d2d2] bg-[#f0f0f0] text-[#0f0f0f] text-sm hover:bg-white transition shadow-sm"
            title="Begin session"
          >
            Start session →
          </button>
        </div>
      </div>
    </div>
  );
}
