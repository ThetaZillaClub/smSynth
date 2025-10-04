"use client";

import useSustainPass from "@/hooks/call-response/useSustainPass";

/**
 * Thin wrapper around the sustain gate we already use,
 * tuned for single-pitch pass/fail.
 */
export default function useSinglePitchGate({
  active,
  targetHz,
  liveHz,
  confidence,
  holdSec,
}: {
  active: boolean;
  targetHz: number | null;
  liveHz: number | null;
  confidence: number;
  holdSec: number;
}) {
  return useSustainPass({
    active,
    targetHz,
    liveHz,
    confidence,
    confMin: 0.6,
    centsTol: 60,
    holdSec,
    retryAfterSec: 6,
  });
}
