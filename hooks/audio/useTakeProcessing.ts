// hooks/audio/useTakeProcessing.ts
"use client";

import { useEffect, useRef, useState } from "react";
import { encodeWavPCM16 } from "@/utils/audio/wav";

type Props = {
  wavBlob: Blob | null | undefined;
  sampleRateOut: number | null | undefined;
  pcm16k: Float32Array | null | undefined; // resampled PCM from useWavRecorder
  /** Exact export length (seconds) for the exercise itself (not including count-in). */
  windowOnSec: number;
  /** Optional head trim (seconds) — e.g., musical count-in to remove from the saved take. */
  trimHeadSec?: number;
  onTakeReady?: (args: { exactBlob: Blob; exactSamples: number }) => void;
};

type Result = { exactBlob: Blob; exactSamples: number } | null;

/** Slice PCM to [start, start+len) with zero-padding or truncation as needed. */
function sliceExactWindow(
  pcm: Float32Array | null | undefined,
  sampleRate: number,
  startSec: number,
  lengthSec: number
): { pcmExact: Float32Array; numSamples: number } {
  const Nwant = Math.max(0, Math.round(lengthSec * sampleRate));
  const start = Math.max(0, Math.round(startSec * sampleRate));

  if (!pcm || pcm.length === 0) {
    return { pcmExact: new Float32Array(Nwant), numSamples: Nwant };
  }

  const idealEnd = start + Nwant;

  if (idealEnd <= pcm.length) {
    return { pcmExact: pcm.slice(start, idealEnd), numSamples: Nwant };
  }

  const out = new Float32Array(Nwant);
  if (start < pcm.length) {
    const available = Math.max(0, Math.min(pcm.length - start, Nwant));
    out.set(pcm.subarray(start, start + available), 0);
  }
  return { pcmExact: out, numSamples: Nwant };
}

/**
 * Processes each completed take:
 *  - trims optional head (e.g., a musical count-in)
 *  - pads/truncates to the exact exercise window
 *  - encodes to WAV (16-bit PCM)
 *  - returns the last result and fires `onTakeReady`
 */
export default function useTakeProcessing({
  wavBlob,
  sampleRateOut,
  pcm16k,
  windowOnSec,
  trimHeadSec = 0,
  onTakeReady,
}: Props): Result {
  const [lastResult, setLastResult] = useState<Result>(null);
  const cbRef = useRef(onTakeReady);
  useEffect(() => {
    cbRef.current = onTakeReady;
  }, [onTakeReady]);

  useEffect(() => {
    if (!wavBlob) return;

    const sr = sampleRateOut || 16000;
    const { pcmExact, numSamples } = sliceExactWindow(pcm16k, sr, trimHeadSec, windowOnSec);
    const exactBlob = encodeWavPCM16(pcmExact, sr);

    const result = { exactBlob, exactSamples: numSamples };
    setLastResult(result);
    cbRef.current?.(result);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wavBlob]);

  return lastResult;
}
