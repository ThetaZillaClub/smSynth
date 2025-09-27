"use client";
import { useEffect, useRef, useState } from "react";
import { HandLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";

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
    console.error = (...args: any[]) => {
      try {
        const first = args?.[0];
        if (typeof first === "string" && NOISY_RE.test(first)) return;
      } catch {}
      return (originalError as any)(...args);
    };

    (async () => {
      try {
        const fileset = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm"
        );
        if (closed) return;
        const lm = await HandLandmarker.createFromOptions(fileset, {
          baseOptions: {
            modelAssetPath:
              "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task",
          },
          runningMode: "VIDEO",
          numHands: 1,
          minTrackingConfidence: 0.25,
          minHandPresenceConfidence: 0.25,
        });
        if (closed) {
          try { lm.close(); } catch {}
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
      try { landmarkerRef.current?.close(); } catch {}
      landmarkerRef.current = null;
      try { console.error = originalError; } catch {}
      setReady(false);
    };
  }, [onError]);

  return { landmarkerRef, ready };
}
