// hooks/transport/useTransport.ts
"use client";

import { useEffect, useMemo, useState } from "react";
import type { TimeSignature } from "@/utils/time/tempo";

type PersistShape = {
  bpm: number;
  ts: TimeSignature;
  leadBeats: number; // lead-in length in beats (relative to ts denominator)
  restBars: number;  // rest length in bars (musical, multiplies by ts.num)
};

const KEY = "transport:v1";

const DEFAULTS: PersistShape = {
  bpm: 80,
  ts: { num: 4, den: 4 },
  leadBeats: 4, // 1 bar in 4/4
  restBars: 1,  // 1 bar rest in any meter
};

function load(): PersistShape {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<PersistShape> | null;
    if (!parsed || !parsed.ts) return DEFAULTS;
    return {
      bpm: Number(parsed.bpm) > 0 ? Number(parsed.bpm) : DEFAULTS.bpm,
      ts: {
        num: Math.max(1, Math.floor(parsed.ts.num ?? DEFAULTS.ts.num)),
        den: Math.max(1, Math.floor(parsed.ts.den ?? DEFAULTS.ts.den)),
      },
      leadBeats:
        Number(parsed.leadBeats) >= 0 ? Number(parsed.leadBeats) : DEFAULTS.leadBeats,
      restBars:
        Number(parsed.restBars) >= 0.125 ? Number(parsed.restBars) : DEFAULTS.restBars,
    };
  } catch {
    return DEFAULTS;
  }
}

function save(v: PersistShape) {
  try {
    localStorage.setItem(KEY, JSON.stringify(v));
  } catch {}
}

/**
 * Global transport state for the SPA.
 * - bpm               (number)
 * - ts.num/ts.den     (time signature)
 * - leadBeats         (musical count-in length, expressed in beats)
 * - restBars          (rest between takes, expressed in bars)
 */
export default function useTransport() {
  const [bpm, setBpm] = useState<number>(DEFAULTS.bpm);
  const [ts, setTs] = useState<TimeSignature>(DEFAULTS.ts);
  const [leadBeats, setLeadBeats] = useState<number>(DEFAULTS.leadBeats);
  const [restBars, setRestBars] = useState<number>(DEFAULTS.restBars);

  // hydrate once on mount
  useEffect(() => {
    const v = load();
    setBpm(v.bpm);
    setTs(v.ts);
    setLeadBeats(v.leadBeats);
    setRestBars(v.restBars);
  }, []);

  // persist when anything changes
  useEffect(() => {
    save({ bpm, ts, leadBeats, restBars });
  }, [bpm, ts, leadBeats, restBars]);

  // helpers to adjust TS safely
  const setTimeSignature = (num: number, den: number) => {
    setTs({ num: Math.max(1, Math.floor(num)), den: Math.max(1, Math.floor(den)) });
  };

  const api = useMemo(
    () => ({
      bpm,
      setBpm: (v: number) => setBpm(Math.max(1, Math.floor(v))),
      ts,
      setTimeSignature,
      leadBeats,
      setLeadBeats: (beats: number) => setLeadBeats(Math.max(0, Number(beats) || 0)),
      restBars,
      setRestBars: (bars: number) => setRestBars(Math.max(0.125, Number(bars) || 0.125)), // allow 1/8 bar minimum
    }),
    [bpm, ts, leadBeats, restBars]
  );

  return api;
}
