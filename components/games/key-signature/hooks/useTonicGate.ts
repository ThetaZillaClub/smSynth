"use client";

import useSustainPass, { type SustainPassState } from "@/hooks/call-response/useSustainPass";
import { noteValueToSeconds, type NoteValue } from "@/utils/time/tempo";

export type UseTonicGateArgs = {
  engaged: boolean;
  running: boolean;
  targetHz: number | null;
  liveHz: number | null;
  confidence: number;
  bpm: number;
  tsDen: number;
  holdOverrideSec?: number;   // optional fixed hold
  confMin?: number;           // default 0.6
  centsTol?: number;          // default 35
  retryAfterSec?: number;     // default 7
};

export function useTonicGate({
  engaged,
  running,
  targetHz,
  liveHz,
  confidence,
  bpm,
  tsDen,
  holdOverrideSec,
  confMin = 0.6,
  centsTol = 35,
  retryAfterSec = 7,
}: UseTonicGateArgs): SustainPassState {
  const eighthSec = noteValueToSeconds("eighth" as NoteValue, bpm, tsDen);
  const holdSec = typeof holdOverrideSec === "number"
    ? holdOverrideSec
    : Math.max(0.25, Math.min(0.6, eighthSec));

  return useSustainPass({
    active: engaged && running && targetHz != null,
    targetHz,
    liveHz,
    confidence,
    confMin,
    centsTol,
    holdSec,
    retryAfterSec,
  });
}

export default useTonicGate;
