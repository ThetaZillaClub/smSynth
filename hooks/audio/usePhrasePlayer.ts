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

  // Cached gentle harmonic spectrum for musical tone
  const waveRef = useRef<PeriodicWave | null>(null);
  const getPeriodicWave = (ctx: AudioContext) => {
    if (waveRef.current) return waveRef.current;
    // Fundamental + very small 2nd/3rd/4th partials (keeps fundamental dominant)
    const real = new Float32Array([0, 1.0, 0.20, 0.10, 0.05]);
    const imag = new Float32Array(real.length); // all sine terms = 0 (cosine series)
    waveRef.current = ctx.createPeriodicWave(real, imag, { disableNormalization: false });
    return waveRef.current;
  };

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

  /** Mild waveshaper to thicken transients without harshness */
  const createSaturator = (ctx: AudioContext, amount = 2.0) => {
    const ws = ctx.createWaveShaper();
    const n = 1024;
    const curve = new Float32Array(n);
    const k = amount; // 0 = linear, 1-4 = gentle
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * 2 - 1;
      curve[i] = Math.tanh(k * x) / Math.tanh(k);
    }
    ws.curve = curve;
    ws.oversample = "2x";
    return ws;
  };

  const isBarline = (beatsFromStart: number, tsNum: number) => {
    // true when we're very close to an integer multiple of tsNum
    const eps = 1e-3;
    const mod = beatsFromStart % tsNum;
    return mod < eps || tsNum - mod < eps;
  };

  /**
   * Thicker metronome tick:
   * Layer A: short filtered noise burst.
   * Layer B: ultra-short triangle "pip" with BP filter (adds body without steady pitch).
   * Accent: slightly brighter, faster, and a tiny upward chirp.
   */
  const playTick = useCallback((time: number, accent = false) => {
    if (!ctxRef.current || !metronomeGainRef.current) return;
    const ctx = ctxRef.current;

    const bus = metronomeGainRef.current;

    // Per-tick master gain (lets us shape the combined envelope)
    const g = ctx.createGain();
    g.gain.value = 1;
    g.connect(bus);

    // ===== Layer A: Noise burst =====
    const noiseLen = Math.ceil(ctx.sampleRate * 0.02); // ~20 ms
    const nbuf = ctx.createBuffer(1, noiseLen, ctx.sampleRate);
    const ch = nbuf.getChannelData(0);
    for (let i = 0; i < noiseLen; i++) {
      ch[i] = (Math.random() * 2 - 1) * Math.exp(-i / (noiseLen * 0.7));
    }

    const noise = ctx.createBufferSource();
    noise.buffer = nbuf;

    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = accent ? 2700 : 2400;
    bp.Q.value = accent ? 6 : 4;

    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 550;
    hp.Q.value = 0.707;

    const sat = createSaturator(ctx, 2.0);
    const ng = ctx.createGain();
    ng.gain.value = accent ? 0.8 : 0.65;

    noise.connect(bp);
    bp.connect(hp);
    hp.connect(sat);
    sat.connect(ng);
    ng.connect(g);

    // Envelope for noise layer
    const nATT = accent ? 0.001 : 0.0015;
    const nREL = accent ? 0.035 : 0.05;
    const nDUR = 0.012;

    ng.gain.setValueAtTime(0.0001, time);
    ng.gain.exponentialRampToValueAtTime(1, time + nATT);
    ng.gain.exponentialRampToValueAtTime(0.0001, time + nDUR + nREL);

    // ===== Layer B: Pitched "pip" =====
    const osc = ctx.createOscillator();
    osc.type = "triangle";
    const baseHz = accent ? 1950 : 1650; // short pip—high, but not "beep"
    osc.frequency.setValueAtTime(baseHz, time);
    if (accent) {
      // tiny upward chirp adds punch without feeling tonal
      osc.frequency.exponentialRampToValueAtTime(baseHz * 1.12, time + 0.03);
    }

    const pipBP = ctx.createBiquadFilter();
    pipBP.type = "bandpass";
    pipBP.frequency.value = accent ? 2100 : 1750;
    pipBP.Q.value = accent ? 9 : 7;

    const og = ctx.createGain();
    og.gain.value = 0.0001;

    osc.connect(pipBP);
    pipBP.connect(og);
    og.connect(g);

    // Envelope for pip
    const pATT = 0.0012;
    const pREL = accent ? 0.055 : 0.06;

    og.gain.setValueAtTime(0.0001, time);
    og.gain.exponentialRampToValueAtTime(accent ? 0.9 : 0.7, time + pATT);
    og.gain.exponentialRampToValueAtTime(0.0001, time + pREL);

    // ===== Master tick tail (prevents hard cutoff clicks) =====
    const tickTail = ctx.createGain();
    tickTail.gain.value = 1;
    tickTail.connect(bus);
    g.connect(tickTail);

    const tailREL = 0.04;
    tickTail.gain.setValueAtTime(1, time);
    tickTail.gain.exponentialRampToValueAtTime(0.0001, time + Math.max(nREL, pREL) + tailREL);

    // Start/stop + cleanup
    const stopAt = time + Math.max(nDUR + nREL, pREL) + tailREL + 0.01;

    noise.start(time);
    noise.stop(stopAt);
    osc.start(time);
    osc.stop(stopAt);

    const cleanup = () => {
      try {
        noise.disconnect(); bp.disconnect(); hp.disconnect();
        sat.disconnect(); ng.disconnect();
        osc.disconnect(); pipBP.disconnect(); og.disconnect();
        g.disconnect(); tickTail.disconnect();
      } catch {}
    };
    osc.onended = cleanup;
  }, []);

  /**
   * More natural amplitude envelope for tones:
   * ~12–20 ms attack, ~80–120 ms release (scaled by note duration).
   */
  const applyEnvelope = (g: GainNode, start: number, dur: number, floor = 0.0001) => {
    const ATT = Math.max(0.012, Math.min(0.02, dur * 0.15));
    const REL = Math.max(0.08, Math.min(0.12, dur * 0.35));
    const now = ctxRef.current!.currentTime;
    const safeStart = Math.max(start, now + 0.005);
    const attEnd = safeStart + ATT;
    const relStart = Math.max(safeStart + ATT * 0.6, safeStart + dur - REL);

    g.gain.cancelScheduledValues(0);
    g.gain.setValueAtTime(floor, safeStart);
    g.gain.exponentialRampToValueAtTime(1, attEnd);
    g.gain.setValueAtTime(1, relStart);
    g.gain.exponentialRampToValueAtTime(floor, relStart + REL);

    return { safeStart, stopAt: relStart + REL + 0.01 };
  };

  /**
   * Musical tone: gentle harmonic spectrum + soft low-pass
   * Keeps A4 exact while sounding less “edgy” than a bare sine.
   */
  const scheduleNote = useCallback((midi: number, start: number, dur: number, a4Hz: number) => {
    if (!ctxRef.current || !noteMasterGainRef.current) return;
    const ctx = ctxRef.current;
    const hz = midiToHz(midi, a4Hz);

    const osc = ctx.createOscillator();
    osc.setPeriodicWave(getPeriodicWave(ctx));
    osc.frequency.value = hz;

    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 3800; // gentle roll-off
    filter.Q.value = 0.707;

    const g = ctx.createGain();
    osc.connect(filter);
    filter.connect(g);
    g.connect(noteMasterGainRef.current);

    const { safeStart, stopAt } = applyEnvelope(g, start, dur);

    osc.start(safeStart);
    osc.stop(stopAt);

    const cleanup = () => {
      try { osc.disconnect(); filter.disconnect(); g.disconnect(); } catch {}
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
        for (let b = 0; b < leadBeats; b++) {
          const accent = b % tsNum === 0;
          playTick(startTime + b * secPerBeat, accent);
        }
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

  /**
   * Standalone tone (e.g., A440) with the same timbre chain.
   */
  const playToneHz = useCallback(
    async (hz: number, durSec: number) => {
      await warm();
      if (!ctxRef.current || !noteMasterGainRef.current) return;

      stopAllScheduled();

      const ctx = ctxRef.current;
      const start = ctx.currentTime + 0.05;

      const osc = ctx.createOscillator();
      osc.setPeriodicWave(getPeriodicWave(ctx));
      osc.frequency.value = hz;

      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = 3800;
      filter.Q.value = 0.707;

      const g = ctx.createGain();
      osc.connect(filter);
      filter.connect(g);
      g.connect(noteMasterGainRef.current);

      const { safeStart, stopAt } = applyEnvelope(g, start, durSec);
      osc.start(safeStart);
      osc.stop(stopAt);
      osc.onended = () => {
        try { osc.disconnect(); filter.disconnect(); g.disconnect(); } catch {}
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
    async (countBeats: number, secPerBeat: number, startAtPerfMs?: number | null, tsNum: number = 4) => {
      await warm();
      if (!ctxRef.current) return;

      stopAllScheduled();

      const nowPerf = performance.now();
      const nowCtx = ctxRef.current.currentTime;
      const mapped = startAtPerfMs != null ? nowCtx + (startAtPerfMs - nowPerf) / 1000 : null;
      const startTime = Math.max(ctxRef.current.currentTime + 0.05, mapped ?? 0);

      for (let b = 0; b < countBeats; b++) {
        const accent = b % tsNum === 0;
        playTick(startTime + b * secPerBeat, accent);
      }
    },
    [warm, playTick, stopAllScheduled]
  );

  const playRhythm = useCallback(
    async (rhythm: RhythmEvent[], opts: PlayOptions & { startAtPerfMs?: number }) => {
      await warm();
      if (!ctxRef.current) return;

      stopAllScheduled();

      const { bpm, tsDen, tsNum, startAtPerfMs } = opts;
      const nowPerf = performance.now();
      const nowCtx = ctxRef.current.currentTime;
      const mapped = startAtPerfMs != null ? nowCtx + (startAtPerfMs - nowPerf) / 1000 : null;
      const startTime = Math.max(ctxRef.current.currentTime + 0.08, mapped ?? 0);

      const secPerBeat = beatsToSeconds(1, bpm, tsDen);
      let t = 0;
      let beatsElapsed = 0;

      for (const ev of rhythm) {
        if (ev.type === "note") {
          const accent = isBarline(beatsElapsed, tsNum);
          playTick(startTime + t, accent);
        }
        const durSec = noteValueToSeconds(ev.value, bpm, tsDen);
        t += durSec;
        beatsElapsed += durSec / secPerBeat;
      }
    },
    [warm, playTick, stopAllScheduled]
  );

  const playMelodyAndRhythm = useCallback(
    async (phrase: Phrase, rhythm: RhythmEvent[], opts: PlayOptions & { startAtPerfMs?: number | null }) => {
      await warm();
      if (!ctxRef.current) return;

      stopAllScheduled();

      const { bpm, tsDen, tsNum, startAtPerfMs, a4Hz = 440, metronome = true } = opts;
      const nowPerf = performance.now();
      const nowCtx = ctxRef.current.currentTime;
      const mapped = startAtPerfMs != null ? nowCtx + (startAtPerfMs - nowPerf) / 1000 : null;
      const startTime = Math.max(ctxRef.current.currentTime + 0.05, mapped ?? 0);

      if (metronome && rhythm?.length) {
        const secPerBeat = beatsToSeconds(1, bpm, tsDen);
        let t = 0;
        let beatsElapsed = 0;
        for (const ev of rhythm) {
          if (ev.type === "note") {
            const accent = isBarline(beatsElapsed, tsNum);
            playTick(startTime + t, accent);
          }
          const durSec = noteValueToSeconds(ev.value, bpm, tsDen);
          t += durSec;
          beatsElapsed += durSec / secPerBeat;
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
