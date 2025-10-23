// providers/AudioIOProvider.tsx
"use client";
import React, { createContext, useContext, useEffect, useMemo } from "react";
import usePhrasePlayer from "@/hooks/audio/usePhrasePlayer";
import useWavRecorder from "@/hooks/audio/useWavRecorder";

type PlayerAPI = ReturnType<typeof usePhrasePlayer>;
type RecorderAPI = ReturnType<typeof useWavRecorder>;

type Ctx = {
  player: PlayerAPI;
  rec: RecorderAPI;
};

const AudioIOCtx = createContext<Ctx | null>(null);

export function AudioIOProvider({ children }: { children: React.ReactNode }) {
  const player = usePhrasePlayer();
  const rec = useWavRecorder({ sampleRateOut: 16000, persistentStream: true });

  // Warm both once here, not in TrainingGame
  useEffect(() => {
    (async () => {
      try { await player.warm(); } catch {}
      try { await rec.warm(); } catch {}
    })();
  }, [player, rec]);

  const value = useMemo<Ctx>(() => ({ player, rec }), [player, rec]);
  return <AudioIOCtx.Provider value={value}>{children}</AudioIOCtx.Provider>;
}

export function useAudioIO() {
  const ctx = useContext(AudioIOCtx);
  if (!ctx) throw new Error("useAudioIO must be used within <AudioIOProvider>");
  return ctx;
}

/** Optional helper you can drop anywhere to auto-stop playback on idle. */
export function AudioIdleStopper({ idle }: { idle: boolean }) {
  const { player } = useAudioIO();
  useEffect(() => { if (idle) player.stop(); }, [idle, player]);
  return null;
}
