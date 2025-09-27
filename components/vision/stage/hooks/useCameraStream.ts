// components/vision/stage/hooks/useCameraStream.ts
"use client";
import { useEffect, useRef } from "react";

type UseCameraStreamOpts = {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  onError?: (msg: string) => void;
  constraints?: MediaStreamConstraints["video"];
};

const DEFAULT_VIDEO_CONSTRAINTS: MediaStreamConstraints["video"] = {
  facingMode: "user",
  width: { ideal: 640 },
  height: { ideal: 480 },
  frameRate: { ideal: 30 },
};

/**
 * Starts a camera stream once and binds it to the given video element.
 * Intentionally ignores subsequent `constraints` prop identity changes to
 * avoid tearing down the stream during re-renders (prevents flicker).
 */
export default function useCameraStream({
  videoRef,
  onError,
  constraints,
}: UseCameraStreamOpts) {
  const streamRef = useRef<MediaStream | null>(null);

  // Lock in the initial constraints for the lifetime of this hook instance.
  const stableConstraintsRef = useRef<MediaStreamConstraints["video"]>(
    constraints ?? DEFAULT_VIDEO_CONSTRAINTS
  );

  useEffect(() => {
    let cancelled = false;
    let s: MediaStream | null = null;

    (async () => {
      try {
        const finalConstraints = stableConstraintsRef.current ?? DEFAULT_VIDEO_CONSTRAINTS;
        s = await navigator.mediaDevices.getUserMedia({
          video: finalConstraints,
          audio: false,
        });
        if (cancelled) return;
        streamRef.current = s;
        const v = videoRef.current;
        if (v) {
          v.srcObject = s;
          v.playsInline = true;
          v.muted = true;
          // Do NOT await play() — prevent race with a later pause() on cleanup.
          const p = v.play();
          if (p && typeof p.catch === "function") p.catch(() => {});
        }
      } catch (e) {
        onError?.((e as Error)?.message ?? "Camera error");
      }
    })();

    return () => {
      cancelled = true;
      const v = videoRef.current;
      try {
        s?.getTracks().forEach((t) => t.stop());
      } catch {}
      try {
        if (v) {
          v.pause();
          v.srcObject = null;
        }
      } catch {}
      streamRef.current = null;
    };
  }, [videoRef, onError]);

  return { streamRef };
}
