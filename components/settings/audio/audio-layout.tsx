// components/settings/audio/audio-layout.tsx
"use client";

import * as React from "react";
import MetronomeVolumeRow from "./volume/MetronomeVolumeRow";
import PhraseVolumeRow from "./volume/PhraseVolumeRow";
import { sliderToGain } from "./volume/VolumeMath";

export const AUDIO_EVENT = "audio:gain-changed";
export const MET_KEY = "audio:metGain:v1";
export const PHR_KEY = "audio:phraseGain:v1";

// Default slider position = 100%
const DEFAULT_SLIDER = 1.0;
const DEFAULT_GAIN = sliderToGain(DEFAULT_SLIDER);

type AudioCtx = {
  metGain: number;
  setMetGain: (g: number) => void;
  phraseGain: number;
  setPhraseGain: (g: number) => void;
};

const Ctx = React.createContext<AudioCtx | null>(null);

function readGain(key: string, fallback = DEFAULT_GAIN): number {
  try {
    const raw = localStorage.getItem(key);
    const n = raw == null ? NaN : Number(raw);
    return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : fallback;
  } catch {
    return fallback;
  }
}

function writeGain(key: string, gain: number, which: "metronome" | "phrase") {
  try {
    localStorage.setItem(key, String(gain));
  } catch {}
  window.dispatchEvent(
    new CustomEvent(AUDIO_EVENT, { detail: { which, gain } })
  );
}

export function useAudioGains(): AudioCtx {
  const ctx = React.useContext(Ctx);

  // Fallback (works outside provider too)
  const [metGain, setMetGainState] = React.useState<number>(() =>
    typeof window !== "undefined" ? readGain(MET_KEY) : DEFAULT_GAIN
  );
  const [phraseGain, setPhraseGainState] = React.useState<number>(() =>
    typeof window !== "undefined" ? readGain(PHR_KEY) : DEFAULT_GAIN
  );

  React.useEffect(() => {
    if (ctx) return;
    const onStorage = (e: StorageEvent) => {
      if (e.key === MET_KEY) setMetGainState(readGain(MET_KEY, metGain));
      if (e.key === PHR_KEY) setPhraseGainState(readGain(PHR_KEY, phraseGain));
    };
    const onBus = (e: Event) => {
      const d = (e as CustomEvent).detail;
      if (d?.which === "metronome") setMetGainState(readGain(MET_KEY, metGain));
      if (d?.which === "phrase") setPhraseGainState(readGain(PHR_KEY, phraseGain));
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener(AUDIO_EVENT, onBus as any);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(AUDIO_EVENT, onBus as any);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx]);

  const setMetGain = React.useCallback((g: number) => {
    if (ctx) ctx.setMetGain(g);
    else {
      setMetGainState(g);
      writeGain(MET_KEY, g, "metronome");
    }
  }, [ctx]);

  const setPhraseGain = React.useCallback((g: number) => {
    if (ctx) ctx.setPhraseGain(g);
    else {
      setPhraseGainState(g);
      writeGain(PHR_KEY, g, "phrase");
    }
  }, [ctx]);

  return ctx ?? { metGain, setMetGain, phraseGain, setPhraseGain };
}

export default function AudioLayout() {
  const [metGain, setMetGain] = React.useState<number>(() => readGain(MET_KEY));
  const [phraseGain, setPhraseGain] = React.useState<number>(() => readGain(PHR_KEY));

  const setMet = React.useCallback((g: number) => {
    setMetGain(g);
    writeGain(MET_KEY, g, "metronome");
  }, []);
  const setPhrase = React.useCallback((g: number) => {
    setPhraseGain(g);
    writeGain(PHR_KEY, g, "phrase");
  }, []);

  const value: AudioCtx = { metGain, setMetGain: setMet, phraseGain, setPhraseGain: setPhrase };

  return (
    <Ctx.Provider value={value}>
      <div className="space-y-8">
        <PhraseVolumeRow />
        <MetronomeVolumeRow />
      </div>
    </Ctx.Provider>
  );
}
