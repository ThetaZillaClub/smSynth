// components/settings/audio/volume/MetronomeVolumeRow.tsx
"use client";

import * as React from "react";
import GainSliderRowBase from "./GainSliderRowBase";
import { useAudioGains } from "../audio-layout";
import usePhrasePlayer from "@/hooks/audio/usePhrasePlayer";

export default function MetronomeVolumeRow() {
  const { metGain, setMetGain } = useAudioGains();
  const { warm, playLeadInTicks } = usePhrasePlayer();

  const onTest = React.useCallback(async () => {
    await warm();
    const secPerBeat = 0.5; // ~120 BPM feel
    const anchor = performance.now() + 250; // small guard
    await playLeadInTicks(4, secPerBeat, anchor, 4);
  }, [warm, playLeadInTicks]);

  return (
    <GainSliderRowBase
      label="Metronome Volume"
      value={metGain}
      onChange={setMetGain}
      onTest={onTest} // ⬅️ adds the circle test button
    />
  );
}
