// hooks/training/useTakeProcessing.ts
"use client";

import { useEffect, useRef, useState } from "react";
import { encodeWavPCM16 } from "@/utils/audio/wav";

type Props = {
  wavBlob: Blob | null | undefined;
  sampleRateOut: number | null | undefined;
  pcm16k: Float32Array | null | undefined; // resampled PCM from useWavRecorder
  windowOnSec: number;
  onTakeReady?: (args: { exactBlob: Blob; exactSamples: number }) => void;
};

type Result = { exactBlob: Blob; exactSamples: number } | null;

/** Local helper — ensures exact take length by padding/truncating the resampled PCM. */
function normalizeExactLength(
  pcm: Float32Array | null | undefined,
  sampleRate: number,
  targetSec: number
): { pcmExact: Float32Array; numSamples: number } {
  const Nwant = Math.max(0, Math.round(targetSec * sampleRate));
  if (!pcm || pcm.length === 0) {
    return { pcmExact: new Float32Array(Nwant), numSamples: Nwant };
  }
  if (pcm.length === Nwant) {
    return { pcmExact: pcm, numSamples: Nwant };
  }
  if (pcm.length > Nwant) {
    return { pcmExact: pcm.slice(0, Nwant), numSamples: Nwant };
  }
  const out = new Float32Array(Nwant);
  out.set(pcm, 0);
  return { pcmExact: out, numSamples: Nwant };
}

/**
 * Processes each completed take:
 *  - trims/pads PCM to the exact record window length
 *  - encodes to WAV (16-bit PCM)
 *  - returns the last result and fires `onTakeReady`
 */
export default function useTakeProcessing({
  wavBlob,
  sampleRateOut,
  pcm16k,
  windowOnSec,
  onTakeReady,
}: Props): Result {
  const [lastResult, setLastResult] = useState<Result>(null);
  const cbRef = useRef(onTakeReady);
  useEffect(() => { cbRef.current = onTakeReady; }, [onTakeReady]);

  useEffect(() => {
    if (!wavBlob) return;

    const sr = sampleRateOut || 16000;
    const { pcmExact, numSamples } = normalizeExactLength(pcm16k, sr, windowOnSec);
    const exactBlob = encodeWavPCM16(pcmExact, sr);

    const result = { exactBlob, exactSamples: numSamples };
    setLastResult(result);
    cbRef.current?.(result);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wavBlob]); // depends only on the signal that a new take exists

  return lastResult;
}
