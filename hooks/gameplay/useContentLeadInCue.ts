// hooks/gameplay/useContentLeadInCue.ts
import { useEffect, useRef } from "react";
import type { Phrase } from "@/utils/stage";
import type { RhythmEvent } from "@/utils/phrase/phraseTypes";

type LoopPhase = "idle" | "call" | "lead-in" | "record" | "rest";

export default function useContentLeadInCue(opts: {
  enabled: boolean;             // exerciseUnlocked
  pretestActive: boolean;
  metronomeEnabled: boolean;    // metronomeEff
  loopPhase: LoopPhase;
  anchorMs: number | null;
  phrase: Phrase | null;
  melodyRhythm: RhythmEvent[] | null;
  bpm: number;
  tsNum: number;
  tsDen: number;
  playPhrase: (p: Phrase, o: any) => Promise<void>;
  playMelodyAndRhythm: (p: Phrase, r: RhythmEvent[], o: any) => Promise<void>;
  stopPlayback: () => void | Promise<void>;
}) {
  const {
    enabled, pretestActive, metronomeEnabled,
    loopPhase, anchorMs, phrase, melodyRhythm,
    bpm, tsNum, tsDen, playPhrase, playMelodyAndRhythm, stopPlayback,
  } = opts;

  // Hold latest fns in refs to avoid effect churn on identity changes
  const playPhraseRef = useRef(playPhrase);
  const playMelodyAndRhythmRef = useRef(playMelodyAndRhythm);
  const stopPlaybackRef = useRef(stopPlayback);
  playPhraseRef.current = playPhrase;
  playMelodyAndRhythmRef.current = playMelodyAndRhythm;
  stopPlaybackRef.current = stopPlayback;

  // One-shot key per lead-in anchor
  const lastKeyRef = useRef<string | null>(null);
  const phraseKey =
    phrase
      ? // very light fingerprint; adjust if you have a stable id
        String((phrase as any)?.id ?? (phrase as any)?.hash ?? (phrase as any)?.notes?.length ?? 0)
      : "none";
  const rhythmKey = melodyRhythm ? String(melodyRhythm.length) : "0";

  const canCue =
    enabled && !pretestActive && !metronomeEnabled && loopPhase === "lead-in" && anchorMs != null && !!phrase;

  const triggerKey = canCue ? `${anchorMs}:${phraseKey}:${rhythmKey}:${bpm}:${tsNum}/${tsDen}` : null;

  useEffect(() => {
    if (!triggerKey) return;
    if (lastKeyRef.current === triggerKey) return;
    lastKeyRef.current = triggerKey;

    try {
      void Promise.resolve(stopPlaybackRef.current());
      const base = { bpm, tsNum, tsDen, a4Hz: 440, metronome: false } as const;

      if (melodyRhythm && melodyRhythm.length > 0) {
        void playMelodyAndRhythmRef.current(phrase as Phrase, melodyRhythm, {
          ...base,
          startAtPerfMs: anchorMs ?? null,
        });
      } else {
        void playPhraseRef.current(phrase as Phrase, {
          ...base,
          leadBars: 0,
          startAtPerfMs: anchorMs ?? null,
        } as any);
      }
    } catch {}
  // Only re-evaluate when the computed triggerKey changes
  }, [triggerKey, melodyRhythm, phrase, anchorMs, bpm, tsNum, tsDen]);
}
