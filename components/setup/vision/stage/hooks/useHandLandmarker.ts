// components/vision/stage/hooks/useHandLandmarker.ts
"use client";
import { useEffect, useRef, useState } from "react";
import { HandLandmarker } from "@mediapipe/tasks-vision";

/**
 * Local MediaPipe runtime + model (served from /public), matching useHandBeat.
 * Ensure these exist:
 *  - /public/models/mediapie/wasm/vision_wasm_internal.{js,wasm}
 *  - /public/models/mediapie/models/hand_landmarker_v0.4.0.task
 */
const WASM_BASE = "/models/mediapie/wasm";
const WASM_LOADER = `${WASM_BASE}/vision_wasm_internal.js`;
const WASM_BINARY = `${WASM_BASE}/vision_wasm_internal.wasm`;
const HAND_MODEL = "/models/mediapie/models/hand_landmarker_v0.4.0.task";

/**
 * MediaPipe HandLandmarker (VIDEO), forgiving to avoid dropouts.
 */
export default function useHandLandmarker(onError?: (msg: string) => void) {
  const landmarkerRef = useRef<HandLandmarker | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let closed = false;

    const originalError = console.error;
    const NOISY_RE =
      /^(INFO:\s+Created TensorFlow Lite .* delegate|INFO:\s+Metal delegate|INFO:\s+WebNN delegate)\b/i;

    // Mute noisy INFO logs from MediaPipe
    console.error = ((...args: unknown[]) => {
      try {
        const first = args?.[0];
        if (typeof first === "string" && NOISY_RE.test(first)) return;
      } catch {}
      return (originalError as (...a: Parameters<typeof console.error>) => void)(
        ...(args as Parameters<typeof console.error>)
      );
    }) as typeof console.error;

    (async () => {
      try {
        const lm = await HandLandmarker.createFromOptions(
          { wasmLoaderPath: WASM_LOADER, wasmBinaryPath: WASM_BINARY },
          {
            baseOptions: { modelAssetPath: HAND_MODEL, delegate: "GPU" },
            runningMode: "VIDEO",
            numHands: 1,
            minTrackingConfidence: 0.25,
            minHandPresenceConfidence: 0.25,
          }
        );
        if (closed) {
          try {
            lm.close();
          } catch {}
          return;
        }
        landmarkerRef.current = lm;
        setReady(true);
      } catch (e) {
        onError?.((e as Error)?.message ?? "Hand model error");
      }
    })();

    return () => {
      closed = true;
      try {
        landmarkerRef.current?.close();
      } catch {}
      landmarkerRef.current = null;
      try {
        console.error = originalError;
      } catch {}
      setReady(false);
    };
  }, [onError]);

  return { landmarkerRef, ready };
}
