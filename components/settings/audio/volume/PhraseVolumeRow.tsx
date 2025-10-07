// components/settings/audio/volume/PhraseVolumeRow.tsx
"use client";

import * as React from "react";
import GainSliderRowBase from "./GainSliderRowBase";
import { useAudioGains } from "../audio-layout";
import usePhrasePlayer from "@/hooks/audio/usePhrasePlayer";

export default function PhraseVolumeRow() {
  const { phraseGain, setPhraseGain } = useAudioGains();
  const { warm, playMidiList } = usePhrasePlayer();

  const onTest = React.useCallback(async () => {
    await warm();
    // small, pleasant C-major arpeggio (C4 E4 G4 C5)
    await playMidiList([60, 64, 67, 72], 0.18, 440);
  }, [warm, playMidiList]);

  return (
    <GainSliderRowBase
      label="Phrase Volume"
      value={phraseGain}
      onChange={setPhraseGain}
      onTest={onTest} // ⬅️ adds the circle test button
    />
  );
}
