// Updated hooks\audio\usePhrasePlayer.ts (add resume, and extra functions)
"use client";
import { useCallback, useEffect, useRef } from "react";
import type { Phrase } from "@/utils/stage";
import { midiToHz } from "@/utils/pitch/pitchMath";
import { beatsToSeconds, barsToBeats } from "@/utils/time/tempo";
import type { RhythmEvent } from "@/utils/phrase/phraseTypes";
import { noteValueToSeconds } from "@/utils/time/tempo";
type PlayOptions = {
  bpm: number;
  tsNum: number;
  tsDen: number;
  leadBars?: number;
  a4Hz?: number;
  gain?: number;
  metronome?: boolean;
};
export default function usePhrasePlayer() {
  const ctxRef = useRef<AudioContext | null>(null);
  const metronomeGainRef = useRef<GainNode | null>(null);
  const noteGainRef = useRef<GainNode | null>(null);
  const scheduledRef = useRef<number[]>([]);
  const initCtx = useCallback(async () => {
    if (!ctxRef.current) {
      ctxRef.current = new AudioContext();
      if (ctxRef.current.state === "suspended") await ctxRef.current.resume();
      metronomeGainRef.current = ctxRef.current.createGain();
      metronomeGainRef.current.gain.value = 0.5; // softer metronome
      metronomeGainRef.current.connect(ctxRef.current.destination);
      noteGainRef.current = ctxRef.current.createGain();
      noteGainRef.current.gain.value = 0.3; // adjust as needed
      noteGainRef.current.connect(ctxRef.current.destination);
    }
  }, []);
  const playTick = useCallback((time: number) => {
    if (!ctxRef.current) return;
    const osc = ctxRef.current.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = 880; // high tick
    osc.connect(metronomeGainRef.current!);
    osc.start(time);
    osc.stop(time + 0.05); // short tick
  }, []);
  const playNote = useCallback((midi: number, start: number, dur: number, a4Hz: number) => {
    if (!ctxRef.current) return;
    const hz = midiToHz(midi, a4Hz);
    const osc = ctxRef.current.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = hz;
    osc.connect(noteGainRef.current!);
    osc.start(start);
    osc.stop(start + dur);
    scheduledRef.current.push(osc.frequency.value); // dummy to track
  }, []);
  const playPhrase = useCallback(async (phrase: Phrase, opts: PlayOptions) => {
    await initCtx();
    const { bpm, tsNum, tsDen, leadBars = 0, a4Hz = 440, metronome = true } = opts;
    if (!ctxRef.current) return;
    // Cancel previous
    scheduledRef.current = [];
    // Lead-in metronome
    const leadBeats = barsToBeats(leadBars, tsNum);
    const secPerBeat = beatsToSeconds(1, bpm, tsDen);
    const startTime = ctxRef.current.currentTime + 0.1; // slight delay to avoid click
    if (metronome) {
      for (let b = 0; b < leadBeats; b++) {
        playTick(startTime + b * secPerBeat);
      }
    }
    // Notes
    for (const note of phrase.notes) {
      playNote(note.midi, startTime + leadBeats * secPerBeat + note.startSec, note.durSec, a4Hz);
    }
  }, [initCtx, playTick, playNote]);
  const stop = useCallback(() => {
    if (ctxRef.current) {
      ctxRef.current.close();
      ctxRef.current = null;
    }
    scheduledRef.current = [];
  }, []);
  useEffect(() => () => stop(), [stop]);
  // Additional functions
  const playInterval = useCallback(async (rootMidi: number, semis: number, opts: PlayOptions) => {
    const phrase: Phrase = {
      durationSec: 1,
      notes: [
        { midi: rootMidi, startSec: 0, durSec: 0.5 },
        { midi: rootMidi + semis, startSec: 0.5, durSec: 0.5 },
      ],
    };
    await playPhrase(phrase, opts);
  }, [playPhrase]);
  const playTriad = useCallback(async (rootMidi: number, isMajor: boolean, opts: PlayOptions) => {
    const third = isMajor ? 4 : 3;
    const fifth = 7;
    const dur = 0.5;
    const phrase: Phrase = {
      durationSec: 1.5,
      notes: [
        { midi: rootMidi, startSec: 0, durSec: dur },
        { midi: rootMidi + third, startSec: dur, durSec: dur },
        { midi: rootMidi + fifth, startSec: dur * 2, durSec: dur },
      ],
    };
    await playPhrase(phrase, opts);
  }, [playPhrase]);
  const playA440 = useCallback(async () => {
    await initCtx();
    if (!ctxRef.current) return;
    const start = ctxRef.current.currentTime;
    playNote(69, start, 2, 440);
  }, [initCtx, playNote]);
  const playRhythm = useCallback(async (rhythm: RhythmEvent[], opts: PlayOptions) => {
    await initCtx();
    const { bpm, tsDen } = opts;
    if (!ctxRef.current) return;
    const startTime = ctxRef.current.currentTime + 0.1;
    let t = 0;
    for (const ev of rhythm) {
      if (ev.type === "note") {
        playTick(startTime + t);
      }
      t += noteValueToSeconds(ev.value, bpm, tsDen);
    }
  }, [initCtx, playTick]);
  return { playPhrase, playInterval, playTriad, playA440, playRhythm, stop };
}