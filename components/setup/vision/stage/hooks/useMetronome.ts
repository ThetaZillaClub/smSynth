// components/vision/stage/hooks/useMetronome.ts
"use client";
import { useCallback, useRef, useEffect } from "react";

export default function useMetronome() {
  const ctxRef = useRef<AudioContext | null>(null);
  const gainRef = useRef<GainNode | null>(null);

  // Mapping anchors
  const perfAtCtxStartRef = useRef<number | null>(null);
  const ctxAtPerfStartRef = useRef<number | null>(null);

  // ---- Settings wiring ----
  const AUDIO_EVENT = "audio:gain-changed";
  const MET_KEY = "audio:metGain:v1";

  const MIN_DB = -40;
  const MIN_GAIN = Math.pow(10, MIN_DB / 20);
  const easeInSine = (u01: number) => 1 - Math.cos((Math.max(0, Math.min(1, u01)) * Math.PI) / 2);
  const sliderToGain = (u01: number) => MIN_GAIN + (1 - MIN_GAIN) * easeInSine(u01);
  const DEFAULT_GAIN = sliderToGain(0.75);

  const readMetGain = useCallback((): number => {
    try {
      const raw = localStorage.getItem(MET_KEY);
      const n = raw == null ? NaN : Number(raw);
      return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : DEFAULT_GAIN;
    } catch {
      return DEFAULT_GAIN;
    }
  }, [DEFAULT_GAIN]);

  const applyMetGain = useCallback((g: number) => {
    const ctx = ctxRef.current;
    const bus = gainRef.current;
    if (!ctx || !bus) return;
    bus.gain.setTargetAtTime(Math.max(0, Math.min(1, g)), ctx.currentTime, 0.01);
  }, []);

  const makeCtx = useCallback(() => {
    type ACType = typeof AudioContext;
    const AC: ACType =
      ("AudioContext" in window
        ? (window as unknown as { AudioContext: ACType }).AudioContext
        : (window as unknown as { webkitAudioContext: ACType }).webkitAudioContext) || AudioContext;

    const ctx = new AC();
    const g = ctx.createGain();
    g.gain.value = 0.95; // temporary until we apply configured value below
    g.connect(ctx.destination);

    ctxRef.current = ctx;
    gainRef.current = g;

    // set mapping anchors
    perfAtCtxStartRef.current = performance.now();
    ctxAtPerfStartRef.current = ctx.currentTime;

    // init from settings
    applyMetGain(readMetGain());

    return ctx;
  }, [applyMetGain, readMetGain]);

  /** Create if needed and *await* resume. MUST be called from a user gesture. */
  const prepare = useCallback(async () => {
    let ctx = ctxRef.current;
    if (!ctx || ctx.state === "closed") {
      ctx = makeCtx();
    }
    if (ctx.state !== "running") {
      try {
        await ctx.resume();
      } catch {}
    }
    // refresh mapping anchors after resume
    perfAtCtxStartRef.current = performance.now();
    ctxAtPerfStartRef.current = ctx.currentTime;

    // ensure bus reflects current setting
    applyMetGain(readMetGain());

    return ctx;
  }, [makeCtx, applyMetGain, readMetGain]);

  /** Safe ensure (awaits resume if needed). Can be used outside gesture if already unlocked. */
  const ensureCtx = useCallback(async () => {
    let ctx = ctxRef.current;
    if (!ctx || ctx.state === "closed") ctx = makeCtx();
    if (ctx.state !== "running") {
      try {
        await ctx.resume();
      } catch {}
    }
    applyMetGain(readMetGain());
    return ctx;
  }, [makeCtx, applyMetGain, readMetGain]);

  /** perf.now() (ms) -> audio currentTime (s) */
  const perfMsToCtxTime = useCallback((perfMs: number | null | undefined) => {
    const ctx = ctxRef.current;
    if (
      perfMs == null ||
      !ctx ||
      perfAtCtxStartRef.current == null ||
      ctxAtPerfStartRef.current == null
    )
      return null;
    return ctxAtPerfStartRef.current + (perfMs - perfAtCtxStartRef.current) / 1000;
  }, []);

  /** audio currentTime (s) -> perf.now() (ms) */
  const ctxTimeToPerfMs = useCallback((ctxTime: number | null | undefined) => {
    if (
      ctxTime == null ||
      perfAtCtxStartRef.current == null ||
      ctxAtPerfStartRef.current == null
    )
      return null;
    return perfAtCtxStartRef.current + (ctxTime - ctxAtPerfStartRef.current) * 1000;
  }, []);

  /** One metronome tick (oscillator blip) at `when` (AudioContext seconds). */
  const playTick = useCallback((when: number, strong = false) => {
    const ctx = ctxRef.current;
    const bus = gainRef.current;
    if (!ctx || !bus) return;

    const start = Math.max(when, ctx.currentTime + 0.05);

    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(strong ? 1320 : 880, start);

    const g = ctx.createGain();
    osc.connect(g);
    g.connect(bus);

    const ATT = 0.001;
    const DUR = 0.05;
    const REL = 0.04;

    g.gain.setValueAtTime(0, start);
    g.gain.linearRampToValueAtTime(strong ? 1.15 : 1.0, start + ATT);
    g.gain.setValueAtTime(1.0, start + DUR - REL);
    g.gain.linearRampToValueAtTime(0, start + DUR);

    osc.start(start);
    osc.stop(start + DUR + 0.01);
    osc.onended = () => {
      try {
        osc.disconnect();
        g.disconnect();
      } catch {}
    };
  }, []);

  /**
   * Schedule 4-beat lead-in + N-beat run.
   */
  const schedulePhrase = useCallback(
    async (opts: {
      startCtxTime?: number;
      startPerfMs?: number;
      secPerBeat: number;
      leadBeats: number;
      runBeats: number;
    }) => {
      const { startCtxTime, startPerfMs, secPerBeat, leadBeats, runBeats } = opts;

      const ctx = await ensureCtx();

      const GUARD = 0.2;
      let t0 =
        typeof startCtxTime === "number"
          ? startCtxTime
          : typeof startPerfMs === "number"
          ? perfMsToCtxTime(startPerfMs) ?? ctx.currentTime + 0.6
          : ctx.currentTime + 0.6;

      t0 = Math.max(t0, ctx.currentTime + GUARD);

      const total = leadBeats + runBeats;
      for (let i = 0; i < total; i++) {
        const when = t0 + i * secPerBeat;
        const strong = i % 4 === 0;
        playTick(when, strong);
      }
    },
    [ensureCtx, perfMsToCtxTime, playTick]
  );

  /** Optional: 0..1 */
  const setVolume = useCallback((v01: number) => {
    const ctx = ctxRef.current;
    const g = gainRef.current;
    if (!ctx || !g) return;
    const v = Math.max(0, Math.min(1, v01));
    g.gain.setTargetAtTime(v, ctx.currentTime, 0.01);
  }, []);

  const close = useCallback(async () => {
    const ctx = ctxRef.current;
    try {
      gainRef.current?.disconnect();
    } catch {}
    gainRef.current = null;
    if (ctx) {
      try {
        if (ctx.state !== "closed") await ctx.suspend();
      } catch {}
      try {
        if (ctx.state !== "closed") await ctx.close();
      } catch {}
    }
    ctxRef.current = null;
    perfAtCtxStartRef.current = null;
    ctxAtPerfStartRef.current = null;
  }, []);

  // Listen for settings changes (both our custom bus and cross-tab storage)
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === MET_KEY) applyMetGain(readMetGain());
    };
    const onBus = (e: Event) => {
      const d = (e as CustomEvent<{ which?: string; gain?: number }>).detail;
      if (d?.which === "metronome") applyMetGain(readMetGain());
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener(AUDIO_EVENT, onBus as EventListener);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(AUDIO_EVENT, onBus as EventListener);
    };
  }, [applyMetGain, readMetGain]);

  return {
    prepare,
    ensureCtx,
    schedulePhrase,
    perfMsToCtxTime,
    ctxTimeToPerfMs,
    setVolume,
    close,
    ctxRef,
  };
}
