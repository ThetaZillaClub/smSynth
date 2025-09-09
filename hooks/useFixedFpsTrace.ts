// hooks/useFixedFpsTrace.ts
"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export default function useFixedFpsTrace(enabled: boolean, fps = 50) {
  const [hzArr, setHzArr] = useState<(number | null)[]>([]);
  const [confArr, setConfArr] = useState<number[]>([]);
  const [rmsDbArr, setRmsDbArr] = useState<number[]>([]);

  const latestHzRef = useRef<number | null>(null);
  const latestConfRef = useRef(0);
  const latestRmsRef = useRef<number>(-120);

  const setLatest = useCallback((hz: number | null, conf: number) => {
    latestHzRef.current = hz;
    latestConfRef.current = conf;
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const dt = 1000 / fps;

    const onRms = (e: Event) => {
      const db = (e as CustomEvent).detail?.db ?? -120;
      latestRmsRef.current = db;
    };

    window.addEventListener("audio-rms", onRms as any);
    const id = setInterval(() => {
      setHzArr((prev) => [...prev, latestHzRef.current]);
      setConfArr((prev) => [...prev, latestConfRef.current]);
      setRmsDbArr((prev) => [...prev, latestRmsRef.current]);
    }, dt);

    return () => {
      clearInterval(id);
      window.removeEventListener("audio-rms", onRms as any);
    };
  }, [enabled, fps]);

  return {
    hzArr,
    confArr,
    rmsDbArr,
    setLatest,
    reset: () => {
      setHzArr([]);
      setConfArr([]);
      setRmsDbArr([]);
    },
  };
}
