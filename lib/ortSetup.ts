// lib/ortSetup.ts
import * as ort from "onnxruntime-web";

/**
 * Call once on the client before creating a session.
 * We set sane defaults for WASM perf, but avoid threads unless COI is true.
 */
export function initOrtEnv() {
  try {
    if (ort.env.wasm) {
      try {
        const hw = (navigator as any).hardwareConcurrency || 2;
        const coi = (globalThis as any).crossOriginIsolated === true;
        // Use threads only when cross-origin isolated; otherwise force 1 to avoid DataCloneError.
        ort.env.wasm.numThreads = coi ? Math.min(4, hw) : 1;
      } catch {}
    }
    ort.env.logLevel = "info";
  } catch {
    // ignore – safe defaults
  }
}
