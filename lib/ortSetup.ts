import * as ort from "onnxruntime-web";

/**
 * Call once on the client before creating a session.
 * We don't mute warnings here; we just set sane defaults for WASM perf.
 */
export function initOrtEnv() {
  try {
    // WASM tuning
    if (ort.env.wasm) {
      try {
        ort.env.wasm.numThreads = Math.min(4, (navigator as any).hardwareConcurrency || 2);
      } catch {}
      // ORT will enable SIMD automatically if the build supports it; no need to force here.
    }
    // Keep default logLevel; we are *fixing* provider mismatch, not hiding it.
    // You can change to 'warning' later if you want quieter dev logs.
    ort.env.logLevel = "info";
  } catch {
    // ignore – safe defaults
  }
}
