// hooks/gameplay/useGameplaySession.ts
"use client";

import * as React from "react";
import type { SessionConfig } from "@/components/training/session";
import { effectiveBpm } from "@/utils/time/speed";
import {
  allowedTonicPcsFromRange,
  resolveTonicPc,
  tonicMidisFromPreference,
} from "@/utils/gameplay/tonic";

/** LocalStorage keys used by the Settings panel */
export const SPEED_KEY = "gameplay:speedPercent";
export const KEY_CHOICE_KEY = "gameplay:keyChoice";   // "random" | "0..11"
export const OCTAVE_PREF_KEY = "gameplay:octavePref"; // "low" | "high"
export const LEAD_KEY = "gameplay:leadBars";          // "1" | "2"
export const AUTOPLAY_KEY = "gameplay:autoplay";      // "on" | "off"

export type KeyChoice = "random" | number;
export type OctPref = "low" | "high";

function readSpeedPercent(): number {
  try {
    const raw = localStorage.getItem(SPEED_KEY);
    const n = raw == null ? NaN : Number(raw);
    return Math.max(75, Math.min(150, Math.round(Number.isFinite(n) ? n : 75)));
  } catch {
    return 75;
  }
}
function readKeyChoice(): KeyChoice {
  try {
    const raw = localStorage.getItem(KEY_CHOICE_KEY);
    if (raw == null || raw === "random") return "random";
    const n = Number(raw);
    return Number.isFinite(n) && n >= 0 && n <= 11 ? (n as number) : "random";
  } catch {
    return "random";
  }
}
function readOctPref(): OctPref {
  try {
    const raw = localStorage.getItem(OCTAVE_PREF_KEY);
    return raw === "high" ? "high" : "low";
  } catch {
    return "low";
  }
}
function readLeadBars(): 1 | 2 {
  try {
    const raw = localStorage.getItem(LEAD_KEY);
    const n = raw == null ? 1 : Math.round(Number(raw));
    return n === 2 ? 2 : 1;
  } catch {
    return 1;
  }
}
function readAutoplay(): boolean {
  try {
    const raw = localStorage.getItem(AUTOPLAY_KEY);
    return raw === "off" ? false : true; // default ON
  } catch {
    return true;
  }
}

/**
 * Centralized gameplay settings → effective SessionConfig mapper.
 * - React-only (no custom hooks imported)
 * - Keeps random tonic stable until inputs change
 */
export function useGameplaySession(params: {
  sessionConfig: SessionConfig;
  lowHz: number | null;
  highHz: number | null;
}) {
  const { sessionConfig, lowHz, highHz } = params;

  // 1) hydrate settings
  const [speedPercent, setSpeedPercent] = React.useState<number>(readSpeedPercent());
  const [keyChoice, setKeyChoice] = React.useState<KeyChoice>(readKeyChoice());
  const [octPref, setOctPref] = React.useState<OctPref>(readOctPref());
  const [leadBars, setLeadBars] = React.useState<1 | 2>(readLeadBars());
  const [autoplay, setAutoplay] = React.useState<boolean>(readAutoplay());

  React.useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === SPEED_KEY) setSpeedPercent(readSpeedPercent());
      if (e.key === KEY_CHOICE_KEY) setKeyChoice(readKeyChoice());
      if (e.key === OCTAVE_PREF_KEY) setOctPref(readOctPref());
      if (e.key === LEAD_KEY) setLeadBars(readLeadBars());
      if (e.key === AUTOPLAY_KEY) setAutoplay(readAutoplay());
    };
    window.addEventListener("storage", onStorage);

    // one-time fresh read (if this mounted before settings page)
    setSpeedPercent(readSpeedPercent());
    setKeyChoice(readKeyChoice());
    setOctPref(readOctPref());
    setLeadBars(readLeadBars());
    setAutoplay(readAutoplay());

    return () => window.removeEventListener("storage", onStorage);
  }, []);

  // 2) derived effective BPM
  const baselineBpm = sessionConfig?.bpm ?? 80;
  const bpmEff = React.useMemo(
    () => effectiveBpm(baselineBpm, speedPercent),
    [baselineBpm, speedPercent]
  );

  // 3) derive tonic from range + key choice (stable random)
  const allowed = React.useMemo(
    () => allowedTonicPcsFromRange(lowHz, highHz),
    [lowHz, highHz]
  );

  // Bitmask of allowed set to detect true membership changes, not just size
  const allowedMask = React.useMemo(() => {
    let mask = 0;
    for (const pc of allowed) mask |= 1 << (((pc % 12) + 12) % 12);
    return mask;
  }, [allowed]);

  const randomPcRef = React.useRef<number | null>(null);

  // reset cached random when membership changes or keyChoice toggles
  React.useEffect(() => {
    randomPcRef.current = null;
  }, [keyChoice, allowedMask]);

  const fallbackPc = (sessionConfig.scale?.tonicPc ?? 0) % 12;
  const resolvedTonicPc = React.useMemo(
    () => resolveTonicPc({ keyChoice, allowed, fallbackPc, randomPcRef }),
    [keyChoice, allowed, fallbackPc]
  );

  const tonicMidis = React.useMemo(
    () => tonicMidisFromPreference(lowHz, highHz, resolvedTonicPc, octPref),
    [lowHz, highHz, resolvedTonicPc, octPref]
  );

  // 4) final effective session
  const session: SessionConfig = React.useMemo(() => {
    const base: SessionConfig = { ...sessionConfig, bpm: bpmEff };
    base.leadBars = leadBars;
    base.loopingMode = !!autoplay;
    const prevScale = base.scale ?? { tonicPc: 0, name: "major" as const };
    base.scale = { ...prevScale, tonicPc: resolvedTonicPc, randomTonic: false };
    base.tonicMidis = tonicMidis ?? null;
    return base;
  }, [sessionConfig, bpmEff, leadBars, autoplay, resolvedTonicPc, tonicMidis]);

  return {
    // effective
    session,
    bpmEff,
    baselineBpm,

    // raw settings (handy for UI/telemetry)
    speedPercent,
    keyChoice,
    octPref,
    leadBars,
    autoplay,

    // derived key data
    resolvedTonicPc,
    tonicMidis,
  } as const;
}
