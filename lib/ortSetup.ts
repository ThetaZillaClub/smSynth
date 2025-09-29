// lib/ortSetup.ts
import * as ort from 'onnxruntime-web';

/**
 * Call once on the client before creating a session.
 * We set sane defaults for WASM perf, but avoid threads unless COI is true.
 */
export function initOrtEnv(): void {
  try {
    if (ort.env.wasm) {
      try {
        const hw =
          typeof navigator !== 'undefined' && 'hardwareConcurrency' in navigator
            ? navigator.hardwareConcurrency
            : 2;

        const coi =
          (globalThis as unknown as { crossOriginIsolated?: boolean })
            .crossOriginIsolated === true;

        // Use threads only when cross-origin isolated; otherwise force 1 to avoid DataCloneError.
        ort.env.wasm.numThreads = coi ? Math.min(4, hw) : 1;
      } catch {}
    }
    ort.env.logLevel = 'info';
  } catch {
    // ignore – safe defaults
  }
}
