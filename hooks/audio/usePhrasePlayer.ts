// hooks/audio/usePhrasePlayer.ts
"use client";
import { useCallback, useEffect, useRef } from "react";
import type { Phrase } from "@/utils/stage";
import { midiToHz } from "@/utils/pitch/pitchMath";
import { beatsToSeconds, barsToBeats, noteValueToSeconds } from "@/utils/time/tempo";
import type { RhythmEvent } from "@/utils/phrase/phraseTypes";

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

  const perfAtCtxStartRef = useRef<number | null>(null);
  const ctxAtPerfStartRef = useRef<number | null>(null);

  const scheduledStopFns = useRef<Array<() => void>>([]);

  const initCtx = useCallback(async () => {
    if (!ctxRef.current) {
      const AC: typeof AudioContext =
        (window as any).AudioContext || (window as any).webkitAudioContext;
      ctxRef.current = new AC();
      if (ctxRef.current.state === "suspended") await ctxRef.current.resume();

      metronomeGainRef.current = ctxRef.current.createGain();
      metronomeGainRef.current.gain.value = 0.5;
      metronomeGainRef.current.connect(ctxRef.current.destination);

      noteMasterGainRef.current = ctxRef.current.createGain();
      noteMasterGainRef.current.gain.value = 0.35;
      noteMasterGainRef.current.connect(ctxRef.current.destination);

      perfAtCtxStartRef.current = performance.now();
      ctxAtPerfStartRef.current = ctxRef.current.currentTime;
    }
  }, []);

  const perfMsToCtxTime = (perfMs: number | null | undefined) => {
    if (
      perfMs == null ||
      !ctxRef.current ||
      perfAtCtxStartRef.current == null ||
      ctxAtPerfStartRef.current == null
    )
      return null;
    return ctxAtPerfStartRef.current + (perfMs - perfAtCtxStartRef.current) / 1000;
  };

  const stopAllScheduled = useCallback(() => {
    try {
      scheduledStopFns.current.forEach((fn) => {
        try {
          fn();
        } catch {}
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
      try {
        osc.disconnect();
        g.disconnect();
      } catch {}
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
      try {
        osc.disconnect();
        g.disconnect();
      } catch {}
    };
    osc.onended = cleanup;

    scheduledStopFns.current.push(() => {
      try {
        osc.stop(ctx.currentTime + 0.001);
        cleanup();
      } catch {}
    });
  }, []);

  const playPhrase = useCallback(
    async (phrase: Phrase, opts: PlayOptions) => {
      await initCtx();
      if (!ctxRef.current) return;
      stopAllScheduled();

      const { bpm, tsNum, tsDen, leadBars = 0, a4Hz = 440, metronome = true } = opts;
      const leadBeats = barsToBeats(leadBars, tsNum);
      const secPerBeat = beatsToSeconds(1, bpm, tsDen);
      const startTime = ctxRef.current.currentTime + 0.08;

      if (metronome && leadBeats > 0) {
        for (let b = 0; b < leadBeats; b++) {
          playTick(startTime + b * secPerBeat);
        }
      }

      for (const n of phrase.notes) {
        scheduleNote(n.midi, startTime + leadBeats * secPerBeat + n.startSec, n.durSec, a4Hz);
      }
    },
    [initCtx, playTick, scheduleNote, stopAllScheduled]
  );

  const stop = useCallback(() => {
    stopAllScheduled();
    if (ctxRef.current) {
      try {
        ctxRef.current.close();
      } catch {}
      ctxRef.current = null;
      perfAtCtxStartRef.current = null;
      ctxAtPerfStartRef.current = null;
    }
  }, [stopAllScheduled]);

  useEffect(() => () => stop(), [stop]);

  /** Play a plain tone in Hz (no lead-in), with envelope. */
  const playToneHz = useCallback(
    async (hz: number, durSec: number) => {
      await initCtx();
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
        try {
          osc.disconnect();
          g.disconnect();
        } catch {}
      };
    },
    [initCtx, stopAllScheduled]
  );

  const playA440 = useCallback(async (durSec: number = 0.5) => {
    await playToneHz(440, durSec);
  }, [playToneHz]);

  const playMidiList = useCallback(
    async (midi: number[], noteDurSec: number, a4Hz: number = 440) => {
      await initCtx();
      if (!ctxRef.current) return;
      stopAllScheduled();

      const base = ctxRef.current.currentTime + 0.05;
      midi.forEach((m, i) => {
        scheduleNote(m, base + i * noteDurSec, noteDurSec, a4Hz);
      });
    },
    [initCtx, scheduleNote, stopAllScheduled]
  );

  /**
   * Lead-in tick scheduler aligned to an optional perf anchor.
   * Now clears any pending clicks first to prevent doubled bars.
   */
  const playLeadInTicks = useCallback(
    async (countBeats: number, secPerBeat: number, startAtPerfMs?: number | null) => {
      await initCtx();
      if (!ctxRef.current) return;

      // clear any previously scheduled clicks (avoid doubled count-ins)
      stopAllScheduled();

      const mapped = perfMsToCtxTime(startAtPerfMs ?? null);
      const startTime = mapped != null ? mapped : ctxRef.current.currentTime + 0.08;

      for (let b = 0; b < countBeats; b++) {
        playTick(startTime + b * secPerBeat);
      }
    },
    [initCtx, playTick, stopAllScheduled]
  );

  const playRhythm = useCallback(
    async (rhythm: RhythmEvent[], opts: PlayOptions & { startAtPerfMs?: number }) => {
      await initCtx();
      if (!ctxRef.current) return;
      stopAllScheduled();

      const { bpm, tsDen, startAtPerfMs } = opts;
      const mapped = perfMsToCtxTime(startAtPerfMs ?? null);
      const startTime = mapped != null ? mapped : ctxRef.current.currentTime + 0.08;

      let t = 0;
      for (const ev of rhythm) {
        if (ev.type === "note") {
          playTick(startTime + t);
        }
        t += noteValueToSeconds(ev.value, bpm, tsDen);
      }
    },
    [initCtx, playTick, stopAllScheduled]
  );

  /** NEW: schedule melody + rhythm together (no double-clear). */
  const playMelodyAndRhythm = useCallback(
    async (
      phrase: Phrase,
      rhythm: RhythmEvent[],
      opts: PlayOptions & { startAtPerfMs?: number | null }
    ) => {
      await initCtx();
      if (!ctxRef.current) return;

      // clear once, then schedule both
      stopAllScheduled();

      const { bpm, tsDen, startAtPerfMs, a4Hz = 440, metronome = true } = opts;
      const mapped = perfMsToCtxTime(startAtPerfMs ?? null);
      const startTime = mapped != null ? mapped : ctxRef.current.currentTime + 0.08;

      // rhythm ticks
      if (metronome && Array.isArray(rhythm) && rhythm.length) {
        let t = 0;
        for (const ev of rhythm) {
          if (ev.type === "note") playTick(startTime + t);
          t += noteValueToSeconds(ev.value, bpm, tsDen);
        }
      }

      // melody notes
      for (const n of phrase.notes) {
        scheduleNote(n.midi, startTime + n.startSec, n.durSec, a4Hz);
      }
    },
    [initCtx, perfMsToCtxTime, playTick, scheduleNote, stopAllScheduled]
  );

  return {
    playPhrase,
    playA440,
    playMidiList,
    playRhythm,
    playLeadInTicks,
    playMelodyAndRhythm, // ← exposed
    stop,
  };
}
