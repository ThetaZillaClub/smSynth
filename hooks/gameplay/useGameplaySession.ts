// hooks/gameplay/useGameplaySession.ts
"use client";

import * as React from "react";
import type { SessionConfig } from "@/components/training/session";
import { effectiveBpm } from "@/utils/time/speed";
import { allowedTonicPcsFromRange, resolveTonicPc, tonicMidisFromPreference } from "@/utils/gameplay/tonic";

/** LocalStorage keys used by the Settings panel */
export const SPEED_KEY = "gameplay:speedPercent";
export const KEY_CHOICE_KEY = "gameplay:keyChoice";   // "random" | "0..11"
export const OCTAVE_PREF_KEY = "gameplay:octavePref"; // "low" | "high"
export const LEAD_KEY = "gameplay:leadBars";          // "1" | "2"
export const AUTOPLAY_KEY = "gameplay:autoplay";      // "on" | "off"
export const VIEW_PREF_KEY = "gameplay:viewPref";     // "piano" | "sheet"   ← NEW

export type KeyChoice = "random" | number;
export type OctPref = "low" | "high";
export type ViewPref = "piano" | "sheet";

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
function readViewPref(): ViewPref {
  try {
    const raw = (localStorage.getItem(VIEW_PREF_KEY) || "").toLowerCase();
    return raw === "sheet" ? "sheet" : "piano"; // default Piano Roll
  } catch {
    return "piano";
  }
}

/**
 * Centralized gameplay settings → effective SessionConfig mapper.
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
  const [viewPref, setViewPref] = React.useState<ViewPref>(readViewPref()); // ← NEW

  React.useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === SPEED_KEY) setSpeedPercent(readSpeedPercent());
      if (e.key === KEY_CHOICE_KEY) setKeyChoice(readKeyChoice());
      if (e.key === OCTAVE_PREF_KEY) setOctPref(readOctPref());
      if (e.key === LEAD_KEY) setLeadBars(readLeadBars());
      if (e.key === AUTOPLAY_KEY) setAutoplay(readAutoplay());
      if (e.key === VIEW_PREF_KEY) setViewPref(readViewPref()); // ← NEW
    };
    window.addEventListener("storage", onStorage);

    // one-time fresh read
    setSpeedPercent(readSpeedPercent());
    setKeyChoice(readKeyChoice());
    setOctPref(readOctPref());
    setLeadBars(readLeadBars());
    setAutoplay(readAutoplay());
    setViewPref(readViewPref()); // ← NEW

    return () => window.removeEventListener("storage", onStorage);
  }, []);

  // 2) derived effective BPM
  const baselineBpm = sessionConfig?.bpm ?? 80;
  const bpmEff = React.useMemo(
    () => effectiveBpm(baselineBpm, speedPercent),
    [baselineBpm, speedPercent]
  );

  // 3) derive tonic from range + key choice
  const allowed = React.useMemo(
    () => allowedTonicPcsFromRange(lowHz, highHz),
    [lowHz, highHz]
  );
  const allowedMask = React.useMemo(() => {
    let mask = 0;
    for (const pc of allowed) mask |= 1 << (((pc % 12) + 12) % 12);
    return mask;
  }, [allowed]);

  const randomPcRef = React.useRef<number | null>(null);
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

    // Apply view preference unless the course explicitly demands Sheet Music.
    // If a lesson hard-codes `view: "sheet"`, we respect it.
    // Otherwise we use the user's setting (default Piano Roll).
    base.view = sessionConfig.view === "sheet" ? "sheet" : viewPref;

    const prevScale = base.scale ?? { tonicPc: 0, name: "major" as const };
    base.scale = { ...prevScale, tonicPc: resolvedTonicPc, randomTonic: false };
    base.tonicMidis = tonicMidis ?? null;
    return base;
  }, [sessionConfig, bpmEff, leadBars, autoplay, viewPref, resolvedTonicPc, tonicMidis]);

  return {
    session,
    bpmEff,
    baselineBpm,

    // raw settings
    speedPercent,
    keyChoice,
    octPref,
    leadBars,
    autoplay,
    viewPref, // ← exposed if you need it in UI/telemetry

    // derived key data
    resolvedTonicPc,
    tonicMidis,
  } as const;
}
