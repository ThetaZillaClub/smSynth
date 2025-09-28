// hooks/audio/usePhrasePlayer.ts
"use client";
import { useCallback, useEffect, useRef } from "react";
import type { Phrase } from "@/utils/stage";
import { midiToHz } from "@/utils/pitch/pitchMath";
import { beatsToSeconds, barsToBeats, noteValueToSeconds } from "@/utils/time/tempo";
import type { RhythmEvent } from "@/utils/phrase/phraseTypes";
import { getAudioContext, resumeAudio, suspendAudio } from "@/lib/audioEngine";

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
  const noteMasterGainRef = useRef<GainNode | null>(null);

  const scheduledStopFns = useRef<Array<() => void>>([]);

  const initCtx = useCallback(async () => {
    if (!ctxRef.current) {
      const ctx = getAudioContext();
      ctxRef.current = ctx;
      await resumeAudio(); // ensure running once on init

      if (!metronomeGainRef.current) {
        metronomeGainRef.current = ctx.createGain();
        metronomeGainRef.current.gain.value = 0.5;
        metronomeGainRef.current.connect(ctx.destination);
      }
      if (!noteMasterGainRef.current) {
        noteMasterGainRef.current = ctx.createGain();
        noteMasterGainRef.current.gain.value = 0.35;
        noteMasterGainRef.current.connect(ctx.destination);
      }
    }
  }, []);

  /** 🔥 Preflight: make sure AC and busses exist & are running. */
  const warm = useCallback(async () => {
    await initCtx();
    if (ctxRef.current?.state !== "running") await resumeAudio();
  }, [initCtx]);

  const stopAllScheduled = useCallback(() => {
    try {
      scheduledStopFns.current.forEach((fn) => {
        try { fn(); } catch {}
      });
    } finally {
      scheduledStopFns.current = [];
    }
  }, []);

  const playTick = useCallback((time: number) => {
    if (!ctxRef.current || !metronomeGainRef.current) return;
    const ctx = ctxRef.current;
    const g = ctx.createGain();
    g.gain.value = 1;
    g.connect(metronomeGainRef.current);

    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = 880;
    osc.connect(g);

    const ATT = 0.001;
    const REL = 0.04;
    const dur = 0.05;

    g.gain.setValueAtTime(0, time);
    g.gain.linearRampToValueAtTime(1, time + ATT);
    g.gain.setValueAtTime(1, time + dur - REL);
    g.gain.linearRampToValueAtTime(0, time + dur);

    osc.start(time);
    osc.stop(time + dur + 0.005);
    osc.onended = () => {
      try { osc.disconnect(); g.disconnect(); } catch {}
    };
  }, []);

  const applyEnvelope = (g: GainNode, start: number, dur: number, floor = 0.0001) => {
    const ATT_MAX = 0.01;
    const REL_MAX = 0.06;
    const att = Math.min(ATT_MAX, Math.max(0.002, dur * 0.2));
    const rel = Math.min(REL_MAX, Math.max(0.02, dur * 0.2));
    const now = ctxRef.current!.currentTime;
    const safeStart = Math.max(start, now + 0.005);
    const attEnd = safeStart + att;
    const relStart = Math.max(safeStart + att * 0.5, safeStart + dur - rel);

    g.gain.cancelScheduledValues(0);
    g.gain.setValueAtTime(floor, safeStart);
    g.gain.exponentialRampToValueAtTime(1, attEnd);
    g.gain.setValueAtTime(1, relStart);
    g.gain.exponentialRampToValueAtTime(floor, relStart + rel);

    return { safeStart, stopAt: relStart + rel + 0.01 };
  };

  const scheduleNote = useCallback((midi: number, start: number, dur: number, a4Hz: number) => {
    if (!ctxRef.current || !noteMasterGainRef.current) return;
    const ctx = ctxRef.current;
    const hz = midiToHz(midi, a4Hz);

    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = hz;

    const g = ctx.createGain();
    osc.connect(g);
    g.connect(noteMasterGainRef.current);

    const { safeStart, stopAt } = applyEnvelope(g, start, dur);

    osc.start(safeStart);
    osc.stop(stopAt);

    const cleanup = () => {
      try { osc.disconnect(); g.disconnect(); } catch {}
    };
    osc.onended = cleanup;

    scheduledStopFns.current.push(() => {
      try { osc.stop(ctx.currentTime + 0.001); cleanup(); } catch {}
    });
  }, []);

  const playPhrase = useCallback(
    async (phrase: Phrase, opts: PlayOptions) => {
      await warm();
      if (!ctxRef.current) return;

      stopAllScheduled();

      const { bpm, tsNum, tsDen, leadBars = 0, a4Hz = 440, metronome = true } = opts;
      const leadBeats = barsToBeats(leadBars, tsNum);
      const secPerBeat = beatsToSeconds(1, bpm, tsDen);
      const startTime = ctxRef.current.currentTime + 0.08;

      if (metronome && leadBeats > 0) {
        for (let b = 0; b < leadBeats; b++) playTick(startTime + b * secPerBeat);
      }

      for (const n of phrase.notes) {
        scheduleNote(n.midi, startTime + leadBeats * secPerBeat + n.startSec, n.durSec, a4Hz);
      }
    },
    [warm, playTick, scheduleNote, stopAllScheduled]
  );

  /** stop all scheduled tones/ticks (no context suspend during session) */
  const stop = useCallback(() => {
    stopAllScheduled();
  }, [stopAllScheduled]);

  /** optional: call this only when *leaving* the page to save battery */
  const powerSaveSuspend = useCallback(() => {
    return suspendAudio();
  }, []);

  useEffect(() => () => stopAllScheduled(), [stopAllScheduled]);

  const playToneHz = useCallback(
    async (hz: number, durSec: number) => {
      await warm();
      if (!ctxRef.current || !noteMasterGainRef.current) return;

      stopAllScheduled();

      const ctx = ctxRef.current;
      const start = ctx.currentTime + 0.05;

      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = hz;

      const g = ctx.createGain();
      osc.connect(g);
      g.connect(noteMasterGainRef.current);

      const { safeStart, stopAt } = applyEnvelope(g, start, durSec);
      osc.start(safeStart);
      osc.stop(stopAt);
      osc.onended = () => {
        try { osc.disconnect(); g.disconnect(); } catch {}
      };
    },
    [warm, stopAllScheduled]
  );

  const playA440 = useCallback(async (durSec: number = 0.5) => {
    await playToneHz(440, durSec);
  }, [playToneHz]);

  const playMidiList = useCallback(
    async (midi: number[], noteDurSec: number, a4Hz: number = 440) => {
      await warm();
      if (!ctxRef.current) return;

      stopAllScheduled();

      const base = ctxRef.current.currentTime + 0.05;
      midi.forEach((m, i) => scheduleNote(m, base + i * noteDurSec, noteDurSec, a4Hz));
    },
    [warm, scheduleNote, stopAllScheduled]
  );

  const playLeadInTicks = useCallback(
    async (countBeats: number, secPerBeat: number, startAtPerfMs?: number | null) => {
      await warm();
      if (!ctxRef.current) return;

      stopAllScheduled();

      const nowPerf = performance.now();
      const nowCtx = ctxRef.current.currentTime;
      const mapped = startAtPerfMs != null ? nowCtx + (startAtPerfMs - nowPerf) / 1000 : null;
      const startTime = Math.max(ctxRef.current.currentTime + 0.05, mapped ?? 0);

      for (let b = 0; b < countBeats; b++) playTick(startTime + b * secPerBeat);
    },
    [warm, playTick, stopAllScheduled]
  );

  const playRhythm = useCallback(
    async (rhythm: RhythmEvent[], opts: PlayOptions & { startAtPerfMs?: number }) => {
      await warm();
      if (!ctxRef.current) return;

      stopAllScheduled();

      const { bpm, tsDen, startAtPerfMs } = opts;
      const nowPerf = performance.now();
      const nowCtx = ctxRef.current.currentTime;
      const mapped = startAtPerfMs != null ? nowCtx + (startAtPerfMs - nowPerf) / 1000 : null;
      const startTime = Math.max(ctxRef.current.currentTime + 0.08, mapped ?? 0);

      let t = 0;
      for (const ev of rhythm) {
        if (ev.type === "note") playTick(startTime + t);
        t += noteValueToSeconds(ev.value, bpm, tsDen);
      }
    },
    [warm, playTick, stopAllScheduled]
  );

  const playMelodyAndRhythm = useCallback(
    async (phrase: Phrase, rhythm: RhythmEvent[], opts: PlayOptions & { startAtPerfMs?: number | null }) => {
      await warm();
      if (!ctxRef.current) return;

      stopAllScheduled();

      const { bpm, tsDen, startAtPerfMs, a4Hz = 440, metronome = true } = opts;
      const nowPerf = performance.now();
      const nowCtx = ctxRef.current.currentTime;
      const mapped = startAtPerfMs != null ? nowCtx + (startAtPerfMs - nowPerf) / 1000 : null;
      const startTime = Math.max(ctxRef.current.currentTime + 0.05, mapped ?? 0);

      if (metronome && rhythm?.length) {
        let t = 0;
        for (const ev of rhythm) {
          if (ev.type === "note") playTick(startTime + t);
          t += noteValueToSeconds(ev.value, bpm, tsDen);
        }
      }

      for (const n of phrase.notes) {
        scheduleNote(n.midi, startTime + n.startSec, n.durSec, a4Hz);
      }
    },
    [warm, playTick, scheduleNote, stopAllScheduled]
  );

  return {
    warm,
    playPhrase,
    playA440,
    playMidiList,
    playRhythm,
    playLeadInTicks,
    playMelodyAndRhythm,
    stop,
    powerSaveSuspend,
  };
}
