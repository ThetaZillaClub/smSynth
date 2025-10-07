// hooks/vision/useVisionLatency.ts
"use client";
import * as React from "react";

const KEY = "vision:latency-ms";
const BUS = "vision:latency-changed";

function read(): number | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

/** Returns the latest calibrated latency (ms) or the provided fallback. */
export default function useVisionLatency(fallback: number | null = null) {
  const [latencyMs, setLatencyMs] = React.useState<number | null>(() =>
    typeof window === "undefined" ? fallback : (read() ?? fallback)
  );

  React.useEffect(() => {
    const onBus = (e: Event) => {
      const ms = (e as CustomEvent).detail?.latencyMs;
      setLatencyMs(typeof ms === "number" || ms === null ? ms : read());
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key === KEY) setLatencyMs(read());
    };
    window.addEventListener(BUS, onBus as any);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(BUS, onBus as any);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  return latencyMs;
}
