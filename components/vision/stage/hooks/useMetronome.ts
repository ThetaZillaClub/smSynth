// components/vision/stage/hooks/useMetronome.ts
"use client";
import { useCallback, useRef } from "react";

/**
 * WebAudio metronome (robust):
 * - Create/resume AudioContext ONLY on demand.
 * - Await resume() inside the user gesture so Safari actually plays.
 * - Stable perf.now() <-> audioTime mapping.
 * - Sample-accurate scheduling (accent every 4th).
 */
export default function useMetronome() {
  const ctxRef = useRef<AudioContext | null>(null);
  const gainRef = useRef<GainNode | null>(null);

  // Mapping anchors
  const perfAtCtxStartRef = useRef<number | null>(null);
  const ctxAtPerfStartRef = useRef<number | null>(null);

  const makeCtx = useCallback(() => {
    const AC: typeof AudioContext =
      (window as any).AudioContext || (window as any).webkitAudioContext;
    const ctx = new AC();
    const g = ctx.createGain();
    g.gain.value = 0.95;
    g.connect(ctx.destination);

    ctxRef.current = ctx;
    gainRef.current = g;

    // set mapping anchors
    perfAtCtxStartRef.current = performance.now();
    ctxAtPerfStartRef.current = ctx.currentTime;

    return ctx;
  }, []);

  /** Create if needed and *await* resume. MUST be called from a user gesture. */
  const prepare = useCallback(async () => {
    let ctx = ctxRef.current;
    if (!ctx || ctx.state === "closed") {
      ctx = makeCtx();
    }
    if (ctx.state !== "running") {
      try {
        await ctx.resume();
      } catch {
        // ignore (some browsers throw if already running)
      }
    }
    // refresh mapping anchors after resume to be safe
    perfAtCtxStartRef.current = performance.now();
    ctxAtPerfStartRef.current = ctx.currentTime;
    return ctx;
  }, [makeCtx]);

  /** Safe ensure (awaits resume if needed). Can be used outside gesture if already unlocked. */
  const ensureCtx = useCallback(async () => {
    let ctx = ctxRef.current;
    if (!ctx || ctx.state === "closed") ctx = makeCtx();
    if (ctx.state !== "running") {
      try { await ctx.resume(); } catch {}
    }
    return ctx;
  }, [makeCtx]);

  /** perf.now() (ms) -> audio currentTime (s) */
  const perfMsToCtxTime = (perfMs: number | null | undefined) => {
    const ctx = ctxRef.current;
    if (
      perfMs == null ||
      !ctx ||
      perfAtCtxStartRef.current == null ||
      ctxAtPerfStartRef.current == null
    ) return null;
    return (
      ctxAtPerfStartRef.current +
      (perfMs - perfAtCtxStartRef.current) / 1000
    );
  };

  /** audio currentTime (s) -> perf.now() (ms) */
  const ctxTimeToPerfMs = (ctxTime: number | null | undefined) => {
    if (
      ctxTime == null ||
      perfAtCtxStartRef.current == null ||
      ctxAtPerfStartRef.current == null
    ) return null;
    return (
      perfAtCtxStartRef.current +
      (ctxTime - ctxAtPerfStartRef.current) * 1000
    );
  };

  /** One metronome tick (oscillator blip) at `when` (AudioContext seconds). */
  const playTick = useCallback((when: number, strong = false) => {
    const ctx = ctxRef.current;
    const bus = gainRef.current;
    if (!ctx || !bus) return;

    // In case resume() just completed, keep a small guard
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
      try { osc.disconnect(); g.disconnect(); } catch {}
    };
  }, []);

  /**
   * Schedule 4-beat lead-in + N-beat run.
   * We *await* a running context before scheduling to avoid silent drops.
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

      const ctx = await ensureCtx(); // <-- running for sure

      const GUARD = 0.20; // extra safety
      let t0 =
        typeof startCtxTime === "number"
          ? startCtxTime
          : typeof startPerfMs === "number"
          ? (perfMsToCtxTime(startPerfMs) ?? ctx.currentTime + 0.6)
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
    try { gainRef.current?.disconnect(); } catch {}
    gainRef.current = null;
    if (ctx) {
      try { if (ctx.state !== "closed") await ctx.suspend(); } catch {}
      try { if (ctx.state !== "closed") await ctx.close(); } catch {}
    }
    ctxRef.current = null;
    perfAtCtxStartRef.current = null;
    ctxAtPerfStartRef.current = null;
  }, []);

  return {
    prepare,       // await in the button click
    ensureCtx,     // safe ensure
    schedulePhrase,
    perfMsToCtxTime,
    ctxTimeToPerfMs,
    setVolume,
    close,
    ctxRef,
  };
}
