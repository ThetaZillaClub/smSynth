// lib/training/primeAudio.ts
import { ensureAudioWorkletLoaded, resumeAudio } from "@/lib/audioEngine";

/**
 * Warm up AudioContext + worklet once.
 * Safe to call any time (idempotent).
 */
let primed = false;

export async function primeAudioOnce() {
  if (primed) return;
  primed = true;
  try {
    await ensureAudioWorkletLoaded();
    await resumeAudio();
  } catch {
    // Non-fatal: detector will still work; this just reduces first-touch latency.
  }
}
