// components/training/TrainingCurriculum.tsx
"use client";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { DEFAULT_SESSION_CONFIG, type SessionConfig } from "./session";
import { parseMidiToPhraseAndLyrics } from "@/utils/midi/smf";
import useStudentRange from "@/hooks/students/useStudentRange";
import { hzToMidi, midiToNoteName } from "@/utils/pitch/pitchMath";
import TransportCard from "./curriculum-layout/TransportCard/TransportCard";
import ImportMidiCard from "./curriculum-layout/ImportMidi/ImportMidiCard";
import ViewSelectCard from "./curriculum-layout/ViewSelect/ViewSelectCard";
import SequenceModeCard from "./curriculum-layout/SequenceMode/SequenceModeCard";
import ScaleCard from "./curriculum-layout/Scale/ScaleCard";
import CallResponseCard from "./curriculum-layout/CallResponse/CallResponseCard";
import RangeCard from "./curriculum-layout/Range/RangeCard";
import RhythmCard from "./curriculum-layout/Rhythm/RhythmCard"; // ✅ re-added

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

  // 🔁 Keep tonicPc valid for the saved range
  useEffect(() => {
    if (!haveRange) return;
    const currentPc = (cfg.scale?.tonicPc ?? 0) % 12;
    if (allowedTonicPcs.has(((currentPc % 12) + 12) % 12)) return;
    if (allowedTonicPcs.size === 0) return;

    const loM = Math.round(hzToMidi(lowHz as number));
    const hiM = Math.round(hzToMidi(highHz as number));
    const mid = Math.round((loM + (hiM - 12)) / 2);

    let bestPc = 0;
    let bestDist = Infinity;
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

    // Build a fully-typed ScaleConfig without using `any`
    type ScaleFromSession = NonNullable<SessionConfig["scale"]>;
    setCfg((c) => {
      const newScale: ScaleFromSession = {
        tonicPc: bestPc,
        name: c.scale?.name ?? "major",
        maxPerDegree: c.scale?.maxPerDegree,
        seed: c.scale?.seed,
        randomTonic: c.scale?.randomTonic,
      };
      return { ...c, scale: newScale };
    });
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

  // ✅ Show preferred-octave chips up to the **maximum** windows across allowed keys.
  // (Launch-time selection is still clamped per chosen key, so we fall back automatically.)
  const availableRandomOctaveCount = useMemo(() => {
    if (!haveRange || allowedTonicPcs.size === 0) return 0;
    const loM = Math.round(hzToMidi(lowHz as number));
    const hiM = Math.round(hzToMidi(highHz as number));
    let maxCount = 0;
    allowedTonicPcs.forEach((pc) => {
      let count = 0;
      for (let m = loM; m <= hiM - 12; m++) {
        if ((((m % 12) + 12) % 12) === pc) count++;
      }
      if (count > maxCount) maxCount = count;
    });
    return maxCount;
  }, [haveRange, allowedTonicPcs, lowHz, highHz]);

  const launch = useCallback(() => {
    // If random key is enabled, choose one allowed tonicPc once at launch
    if (cfg.scale?.randomTonic) {
      if (!haveRange || allowedTonicPcs.size === 0) {
        onStart(cfg); // nothing to randomize
        return;
      }
      const pcs = Array.from(allowedTonicPcs);
      const chosenPc = pcs[Math.floor(Math.random() * pcs.length)];
      // Build tonic windows (absolute midis) for the chosen key inside saved range
      const loM = Math.round(hzToMidi(lowHz as number));
      const hiM = Math.round(hzToMidi(highHz as number));
      const windows: number[] = [];
      for (let m = loM; m <= hiM - 12; m++) {
        if ((((m % 12) + 12) % 12) === chosenPc) windows.push(m);
      }
      let nextTonicMidis: number[] | null = null;
      if (windows.length) {
        // Read deprecated single index safely, without `any`
        type LegacyCfg = { preferredOctaveIndex?: number };
        const legacyIdx = (cfg as LegacyCfg).preferredOctaveIndex;
        const rawIdx =
          Array.isArray(cfg.preferredOctaveIndices) && cfg.preferredOctaveIndices.length
            ? cfg.preferredOctaveIndices[0]!
            : (typeof legacyIdx === "number" ? legacyIdx : 1);
        const idx = Math.min(Math.max(0, rawIdx), windows.length - 1);
        nextTonicMidis = [windows[idx]];
      }
      onStart({
        ...cfg,
        scale: { ...(cfg.scale ?? {}), tonicPc: chosenPc, randomTonic: false },
        tonicMidis: nextTonicMidis,
      });
    } else {
      onStart(cfg);
    }
  }, [cfg, onStart, haveRange, allowedTonicPcs, lowHz, highHz]);

  const onMidiFile = useCallback(async (file: File) => {
    const buf = await file.arrayBuffer();
    try {
      const { phrase, lyrics } = parseMidiToPhraseAndLyrics(buf);
      setCfg((c) => ({ ...c, customPhrase: phrase, customWords: lyrics }));
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
          {/* Column 1: Transport & Session, Import MIDI, Rhythm Line, Call & Response */}
          <div className="flex flex-col gap-3">
            <TransportCard
              bpm={cfg.bpm}
              ts={cfg.ts}
              leadBars={cfg.leadBars}
              restBars={cfg.restBars}
              exerciseLoops={cfg.exerciseLoops}
              regenerateBetweenTakes={cfg.regenerateBetweenTakes}
              metronome={cfg.metronome}
              /** NEW */
              loopingMode={cfg.loopingMode}
              onChange={pushChange}
            />

            <ImportMidiCard
              hasPhrase={!!cfg.customPhrase}
              onClear={() => {
                setCfg((c) => ({ ...c, customPhrase: null, customWords: null }));
              }}
              onFile={onMidiFile}
            />

            {/* ✅ Rhythm line controls (blue guide under the sheet/piano views) */}
            <RhythmCard cfg={cfg} onChange={pushChange} />

            {/* Pre-Test */}
            <CallResponseCard cfg={cfg} onChange={pushChange} />
          </div>

          {/* Column 2: View, Scale, Exercise Mode, Range/Tonic Windows */}
          <div className="flex flex-col gap-3">
            <ViewSelectCard value={cfg.view} onChange={pushChange} />
            <ScaleCard
              cfg={cfg}
              onChange={pushChange}
              allowedTonicPcs={allowedTonicPcs}
              rangeHint={rangeHint}
              availableRandomOctaveCount={availableRandomOctaveCount}
            />
            <SequenceModeCard cfg={cfg} onChange={pushChange} />
            <RangeCard
              cfg={cfg}
              lowHz={lowHz ?? null}
              highHz={highHz ?? null}
              onChange={pushChange}
            />
          </div>

          {/* Start button under column 2, slightly inset from the right edge */}
          <div className="lg:col-start-2 flex justify-end pr-2 pt-1">
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
    </div>
  );
}
