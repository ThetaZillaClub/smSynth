// hooks/gameplay/useMelodyClef.ts
import { useMemo } from "react";
import { hzToMidi } from "@/utils/pitch/pitchMath";
import { isInScale } from "@/utils/phrase/scales";
import { pickClef } from "@/components/training/layout/stage/sheet/vexscore/builders";
import type { Phrase } from "@/utils/stage";
import type { SessionConfig } from "@/components/training/session/types";

export function useMelodyClef(params: {
  phrase: Phrase | null;
  scale: SessionConfig["scale"] | undefined;
  sessionConfig: SessionConfig;
  lowHz: number | null;
  highHz: number | null;
}): "treble" | "bass" | null {
  const { phrase, scale, sessionConfig, lowHz, highHz } = params;

  return useMemo(() => {
    if (!scale || lowHz == null || highHz == null) {
      return phrase ? pickClef(phrase) : null;
    }

    const a4 = 440;
    const loM = Math.round(hzToMidi(Math.min(lowHz, highHz), a4));
    const hiM = Math.round(hzToMidi(Math.max(lowHz, highHz), a4));

    let allowed: number[] = [];
    for (let m = loM; m <= hiM; m++) {
      const pc = ((m % 12) + 12) % 12;
      if (isInScale(pc, scale.tonicPc, scale.name as any)) allowed.push(m);
    }

    const tonicMidis = sessionConfig.tonicMidis ?? null;
    if (tonicMidis && tonicMidis.length) {
      const sorted = Array.from(new Set(tonicMidis.map((x) => Math.round(x)))).sort((a, b) => a - b);
      const windows = sorted.map((T) => [T, T + 12] as const);
      const minStart = windows[0][0];
      const maxEnd = windows[windows.length - 1][1];
      const inAny = (m: number) => windows.some(([s, e]) => m >= s && m <= e);
      const underOk = !!sessionConfig.randomIncludeUnder ? (m: number) => m < minStart : () => false;
      const overOk  = !!sessionConfig.randomIncludeOver  ? (m: number) => m > maxEnd  : () => false;
      const filtered = allowed.filter((m) => inAny(m) || underOk(m) || overOk(m));
      if (filtered.length) allowed = filtered;
    }

    const whitelist = sessionConfig.allowedMidis ?? null;
    if (whitelist && whitelist.length) {
      const allowSet = new Set(whitelist.map((m) => Math.round(m)));
      const filtered = allowed.filter((m) => allowSet.has(m));
      if (filtered.length) allowed = filtered;
    }

    if (!allowed.length) return phrase ? pickClef(phrase) : "treble";

    const uniq = Array.from(new Set(allowed));
    const below = uniq.filter((m) => m < 60).length;
    const atOrAbove = uniq.length - below;
    return atOrAbove >= below ? "treble" : "bass";
  }, [phrase, scale, sessionConfig, lowHz, highHz]);
}
