// components/settings/vision/latency/LatencyRow.tsx
"use client";

import * as React from "react";

const LAT_KEY = "vision:latency-ms";
const LAT_EVENT = "vision:latency-changed";

function readLatency(): number | null {
  try {
    const raw = localStorage.getItem(LAT_KEY);
    const n = raw == null ? NaN : Number(raw);
    return Number.isFinite(n) ? Math.round(n) : null;
  } catch {
    return null;
  }
}

export default function LatencyRow() {
  const [latencyMs, setLatencyMs] = React.useState<number | null>(null);

  const refresh = React.useCallback(() => setLatencyMs(readLatency()), []);

  React.useEffect(() => {
    // initial read
    refresh();

    // cross-tab updates via storage event
    const onStorage = (e: StorageEvent) => {
      if (e.key === LAT_KEY) refresh();
    };
    window.addEventListener("storage", onStorage);

    // same-tab updates via a small custom event
    const onCustom = () => refresh();
    window.addEventListener(LAT_EVENT, onCustom);

    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(LAT_EVENT, onCustom);
    };
  }, [refresh]);

  const clearLatency = () => {
    try {
      localStorage.removeItem(LAT_KEY);
      window.dispatchEvent(new CustomEvent(LAT_EVENT));
    } finally {
      refresh();
    }
  };

  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex flex-col">
        <span className="text-sm font-medium text-[#0f0f0f]">Measured Latency</span>
        <span className="text-xs text-[#6b6b6b]">
          {latencyMs != null ? `${latencyMs} ms` : "Not calibrated"}
        </span>
      </div>

      <div className="inline-flex items-center gap-2">
        <button
          type="button"
          onClick={refresh}
          className="px-3 py-1.5 text-sm rounded-md border border-[#dcdcdc] bg-[#f2f2f2] hover:bg-[#f6f6f6] transition"
        >
          Refresh
        </button>
        <button
          type="button"
          onClick={clearLatency}
          className="px-3 py-1.5 text-sm rounded-md border border-[#dcdcdc] bg-[#fdfdfd] hover:bg-[#f6f6f6] transition disabled:opacity-50"
          disabled={latencyMs == null}
          aria-disabled={latencyMs == null}
        >
          Clear
        </button>
      </div>
    </div>
  );
}
