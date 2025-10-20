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

/** Internal representation of a musical "voice" (a note tone) we can release gracefully. */
type Voice = {
  osc: OscillatorNode;  // main (warm) oscillator
  g: GainNode;          // shared envelope gain
  cleanup: () => void;
  released?: boolean;
};

/** Timbre tuning: warmer partials + dynamic low-pass so highs don't feel "sharp"/edgy. */
const TIMBRE = {
  // Cosine-series amplitudes for harmonics 1..4 (very gentle)
  partials: [1.0, 0.08, 0.04, 0.02] as const,
  // Low-pass cutoff ~ k * fundamental, clamped to [min,max]
  // ↓ slightly darker & less resonant to reduce perceived "sharpness"
  lpfMult: 2.0,   // was 2.6
  lpfMin: 900,    // was 1200
  lpfMax: 2800,   // was 3000
  lpfQ: 0.35,     // was 0.55
  // Anchor & subharmonic helpers
  anchorMs: 140,  // brief pure sine at onset to lock pitch
  subGain: 0.05,  // ≈ -26 dB at f0/2
};

export default function usePhrasePlayer() {
  const ctxRef = useRef<AudioContext | null>(null);
  const metronomeGainRef = useRef<GainNode | null>(null);
  const noteMasterGainRef = useRef<GainNode | null>(null);

  /** Ticks / misc scheduled stops. Voices are tracked separately for graceful release. */
  const scheduledStopFns = useRef<Array<() => void>>([]);

  /** Set of active musical voices (notes) so we can fade them out on stop(). */
  const activeVoicesRef = useRef<Set<Voice>>(new Set());

  // ---- Settings wiring (keys + helpers) ----
  const AUDIO_EVENT = "audio:gain-changed";
  const MET_KEY = "audio:metGain:v1";
  const PHR_KEY = "audio:phraseGain:v1";

  // Same curve as settings: 0% ≈ -40 dB, easeInSine to 0 dB at 100%
  const MIN_DB = -40;
  const MIN_GAIN = Math.pow(10, MIN_DB / 20); // ≈ 0.01
  const easeInSine = (u01: number) => 1 - Math.cos((Math.max(0, Math.min(1, u01)) * Math.PI) / 2);
  const sliderToGain = (u01: number) => MIN_GAIN + (1 - MIN_GAIN) * easeInSine(u01);
  const DEFAULT_GAIN = sliderToGain(0.75);

  const readGain = (key: string) => {
    try {
      const raw = localStorage.getItem(key);
      const n = raw == null ? NaN : Number(raw);
      return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : DEFAULT_GAIN;
    } catch {
      return DEFAULT_GAIN;
    }
  };

  const applyMetGain = (g?: number) => {
    const ctx = ctxRef.current;
    const bus = metronomeGainRef.current;
    if (!ctx || !bus) return;
    const val = g ?? readGain(MET_KEY);
    bus.gain.setTargetAtTime(Math.max(0, Math.min(1, val)), ctx.currentTime, 0.01);
  };

  const applyPhraseGain = (g?: number) => {
    const ctx = ctxRef.current;
    const bus = noteMasterGainRef.current;
    if (!ctx || !bus) return;
    const val = g ?? readGain(PHR_KEY);
    bus.gain.setTargetAtTime(Math.max(0, Math.min(1, val)), ctx.currentTime, 0.01);
  };

  // Cached gentle harmonic spectrum for musical tone (warmer than before)
  const warmWaveRef = useRef<PeriodicWave | null>(null);
  const getWarmPeriodicWave = (ctx: AudioContext) => {
    if (warmWaveRef.current) return warmWaveRef.current;
    // Cosine (real) series: fundamental dominant, very small 2nd/3rd/4th
    // This reads as "round" and reduces the psychoacoustic sharpness brightness can cause.
    const real = new Float32Array([0, ...TIMBRE.partials]); // index 0 ignored
    const imag = new Float32Array(real.length); // sine terms 0
    warmWaveRef.current = ctx.createPeriodicWave(real, imag, { disableNormalization: false });
    return warmWaveRef.current;
  };

  const initCtx = useCallback(async () => {
    if (!ctxRef.current) {
      const ctx = getAudioContext();
      ctxRef.current = ctx;
      await resumeAudio(); // ensure running once on init

      if (!metronomeGainRef.current) {
        metronomeGainRef.current = ctx.createGain();
        metronomeGainRef.current.gain.value = 0.5; // temp until settings applied
        metronomeGainRef.current.connect(ctx.destination);
        applyMetGain(); // ⬅️ set from settings
      }
      if (!noteMasterGainRef.current) {
        noteMasterGainRef.current = ctx.createGain();
        noteMasterGainRef.current.gain.value = 0.35; // temp until settings applied
        noteMasterGainRef.current.connect(ctx.destination);
        applyPhraseGain(); // ⬅️ set from settings
      }
    }
  }, []);

  /** 🔥 Preflight: make sure AC and busses exist & are running. */
  const warm = useCallback(async () => {
    await initCtx();
    if (ctxRef.current?.state !== "running") await resumeAudio();
    // ensure current settings are reflected whenever we warm
    applyMetGain();
    applyPhraseGain();
  }, [initCtx]);

  /** Mild waveshaper to thicken metronome transients without harshness (ticks only) */
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
    const eps = 1e-3;
    const mod = beatsFromStart % tsNum;
    return mod < eps || tsNum - mod < eps;
  };

  /**
   * Thicker metronome tick (unchanged).
   */
  const playTick = useCallback((time: number, accent = false) => {
    if (!ctxRef.current || !metronomeGainRef.current) return;
    const ctx = ctxRef.current;

    const bus = metronomeGainRef.current;

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
    const baseHz = accent ? 1950 : 1650;
    osc.frequency.setValueAtTime(baseHz, time);
    if (accent) {
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

    // Master tick tail
    const tickTail = ctx.createGain();
    tickTail.gain.value = 1;
    tickTail.connect(bus);
    g.connect(tickTail);

    const tailREL = 0.04;
    tickTail.gain.setValueAtTime(1, time);
    tickTail.gain.exponentialRampToValueAtTime(0.0001, time + Math.max(nREL, pREL) + tailREL);

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

    scheduledStopFns.current.push(() => {
      try { noise.stop(ctx.currentTime + 0.001); } catch {}
      try { osc.stop(ctx.currentTime + 0.001); } catch {}
      try { g.disconnect(); tickTail.disconnect(); } catch {}
    });
  }, []);

  /**
   * Natural amplitude envelope for tones.
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

    return { safeStart, stopAt: relStart + REL + 0.01, relSec: REL };
  };

  /**
   * Graceful release for a voice: ramp gain down quickly and stop the main osc after the tail.
   */
  const releaseVoice = useCallback((voice: Voice, relSecOverride?: number) => {
    const ctx = ctxRef.current;
    if (!ctx || !voice || voice.released) return;

    const now = ctx.currentTime;
    const REL = Math.max(0.06, Math.min(0.15, (relSecOverride ?? 0.1)));

    try {
      voice.g.gain.cancelScheduledValues(0);
      const current = voice.g.gain.value;
      voice.g.gain.setValueAtTime(Math.max(0.0001, current), now);
      voice.g.gain.exponentialRampToValueAtTime(0.0001, now + REL);
      voice.osc.stop(now + REL + 0.01);
      voice.released = true;
    } catch {
      // ignore
    }
  }, []);

  /** stop all scheduled tones/ticks gracefully (no context suspend during session) */
  const stopAllScheduled = useCallback(() => {
    // Release all active phrase voices
    activeVoicesRef.current.forEach((v) => releaseVoice(v));

    // Stop any ticking/percussion sources
    try {
      scheduledStopFns.current.forEach((fn) => {
        try { fn(); } catch {}
      });
    } finally {
      scheduledStopFns.current = [];
    }
  }, [releaseVoice]);

  /**
   * Musical tone (warmer recipe) with:
   * - Warm periodic wave (tiny upper partials)
   * - LPF cutoff key-tracked to fundamental (prevents "bright = sharp" illusion)
   * - Brief sine anchor at onset
   * - Very quiet subharmonic (f0/2) to stabilize perceived pitch
   * - Same soft envelope
   */
  const scheduleNote = useCallback((midi: number, start: number, dur: number, a4Hz: number) => {
    if (!ctxRef.current || !noteMasterGainRef.current) return;
    const ctx = ctxRef.current;
    const hz = midiToHz(midi, a4Hz);

    // Main warm oscillator
    const osc = ctx.createOscillator();
    osc.setPeriodicWave(getWarmPeriodicWave(ctx));
    osc.frequency.value = hz;

    // Pitch anchor: brief pure sine at f0
    const anchor = ctx.createOscillator();
    anchor.type = "sine";
    anchor.frequency.value = hz;
    const anchorGain = ctx.createGain();
    anchorGain.gain.value = 0;

    // Subharmonic anchor: f0/2 at very low level
    const sub = ctx.createOscillator();
    sub.type = "sine";
    sub.frequency.value = hz / 2;
    const subGain = ctx.createGain();
    subGain.gain.value = TIMBRE.subGain;

    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    const cutoff = Math.max(TIMBRE.lpfMin, Math.min(TIMBRE.lpfMax, hz * TIMBRE.lpfMult));
    filter.frequency.setValueAtTime(cutoff, ctx.currentTime);
    filter.Q.value = TIMBRE.lpfQ;

    const g = ctx.createGain();
    osc.connect(filter);
    anchor.connect(anchorGain);
    anchorGain.connect(filter);
    sub.connect(subGain);
    subGain.connect(filter);
    filter.connect(g);
    g.connect(noteMasterGainRef.current);

    const { safeStart, stopAt, relSec } = applyEnvelope(g, start, dur);

    // Crossfade: ~140ms sine → warm wave
    const ANCHOR_SEC = TIMBRE.anchorMs / 1000;
    anchorGain.gain.setValueAtTime(0.0, safeStart);
    anchorGain.gain.linearRampToValueAtTime(0.9, safeStart + 0.02);         // up quickly
    anchorGain.gain.linearRampToValueAtTime(0.0, safeStart + ANCHOR_SEC);    // down by ~140ms

    const voice: Voice = {
      osc,
      g,
      cleanup: () => {
        try {
          osc.disconnect();
          anchor.disconnect(); anchorGain.disconnect();
          sub.disconnect(); subGain.disconnect();
          filter.disconnect(); g.disconnect();
        } catch {}
        activeVoicesRef.current.delete(voice);
      },
    };
    activeVoicesRef.current.add(voice);
    osc.onended = () => voice.cleanup();

    osc.start(safeStart);
    anchor.start(safeStart);
    sub.start(safeStart);

    anchor.stop(stopAt);
    sub.stop(stopAt);
    osc.stop(stopAt);

    // If stop() happens mid-note, release gracefully using our envelope tail.
    scheduledStopFns.current.push(() => {
      releaseVoice(voice, relSec);
      // ensure auxiliary oscillators don't linger
      try { anchor.stop(ctx.currentTime + 0.01); } catch {}
      try { sub.stop(ctx.currentTime + 0.01); } catch {}
    });
  }, [releaseVoice]);

  const playPhrase = useCallback(
    async (phrase: Phrase, opts: PlayOptions & { startAtPerfMs?: number | null }) => {
      await warm();
      if (!ctxRef.current) return;

      stopAllScheduled();

      const { bpm, tsNum, tsDen, leadBars = 0, a4Hz = 440, metronome = true, startAtPerfMs } = opts;
      const leadBeats = barsToBeats(leadBars, tsNum);
      const secPerBeat = beatsToSeconds(1, bpm, tsDen);

      const nowPerf = performance.now();
      const nowCtx = ctxRef.current.currentTime;
      const mapped = startAtPerfMs != null ? nowCtx + (startAtPerfMs - nowPerf) / 1000 : null;
      const startTime = Math.max(ctxRef.current.currentTime + 0.08, mapped ?? 0);

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

  /** public stop(): graceful release for voices + stop ticks */
  const stop = useCallback(() => {
    stopAllScheduled();
  }, [stopAllScheduled]);

  /** optional: call this only when *leaving* the page to save battery */
  const powerSaveSuspend = useCallback(() => {
    return suspendAudio();
  }, []);

  useEffect(() => () => stopAllScheduled(), [stopAllScheduled]);

  /**
   * Standalone tone (e.g., A440) with the same timbre chain (warm + anchor + sub).
   */
  const playToneHz = useCallback(
    async (hz: number, durSec: number) => {
      await warm();
      if (!ctxRef.current || !noteMasterGainRef.current) return;

      stopAllScheduled();

      const ctx = ctxRef.current;
      const start = ctx.currentTime + 0.05;

      // Main warm oscillator
      const osc = ctx.createOscillator();
      osc.setPeriodicWave(getWarmPeriodicWave(ctx));
      osc.frequency.value = hz;

      // Pitch anchor: brief pure sine at f0
      const anchor = ctx.createOscillator();
      anchor.type = "sine";
      anchor.frequency.value = hz;
      const anchorGain = ctx.createGain();
      anchorGain.gain.value = 0;

      // Subharmonic f0/2
      const sub = ctx.createOscillator();
      sub.type = "sine";
      sub.frequency.value = hz / 2;
      const subGain = ctx.createGain();
      subGain.gain.value = TIMBRE.subGain;

      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      const cutoff = Math.max(TIMBRE.lpfMin, Math.min(TIMBRE.lpfMax, hz * TIMBRE.lpfMult));
      filter.frequency.setValueAtTime(cutoff, ctx.currentTime);
      filter.Q.value = TIMBRE.lpfQ;

      const g = ctx.createGain();
      osc.connect(filter);
      anchor.connect(anchorGain);
      anchorGain.connect(filter);
      sub.connect(subGain);
      subGain.connect(filter);
      filter.connect(g);
      g.connect(noteMasterGainRef.current);

      const { safeStart, stopAt, relSec } = applyEnvelope(g, start, durSec);

      // Crossfade anchor
      const ANCHOR_SEC = TIMBRE.anchorMs / 1000;
      anchorGain.gain.setValueAtTime(0.0, safeStart);
      anchorGain.gain.linearRampToValueAtTime(0.9, safeStart + 0.02);
      anchorGain.gain.linearRampToValueAtTime(0.0, safeStart + ANCHOR_SEC);

      const voice: Voice = {
        osc,
        g,
        cleanup: () => {
          try {
            osc.disconnect();
            anchor.disconnect(); anchorGain.disconnect();
            sub.disconnect(); subGain.disconnect();
            filter.disconnect(); g.disconnect();
          } catch {}
          activeVoicesRef.current.delete(voice);
        },
      };
      activeVoicesRef.current.add(voice);
      osc.onended = () => voice.cleanup();

      osc.start(safeStart);
      anchor.start(safeStart);
      sub.start(safeStart);

      anchor.stop(stopAt);
      sub.stop(stopAt);
      osc.stop(stopAt);

      scheduledStopFns.current.push(() => {
        releaseVoice(voice, relSec);
        try { anchor.stop(ctx.currentTime + 0.01); } catch {}
        try { sub.stop(ctx.currentTime + 0.01); } catch {}
      });
    },
    [warm, stopAllScheduled, releaseVoice]
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

  // Live updates: react to Audio settings changes and cross-tab updates
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === MET_KEY) applyMetGain();
      if (e.key === PHR_KEY) applyPhraseGain();
    };
    const onBus = (e: Event) => {
      const d = (e as CustomEvent).detail;
      if (d?.which === "metronome") applyMetGain();
      if (d?.which === "phrase") applyPhraseGain();
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener(AUDIO_EVENT, onBus as any);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(AUDIO_EVENT, onBus as any);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    warm,
    playPhrase,
    playA440,
    playMidiList,
    playRhythm,
    playLeadInTicks,
    playMelodyAndRhythm,
    stop,                // graceful fade (no clicks)
    powerSaveSuspend,
  };
}
