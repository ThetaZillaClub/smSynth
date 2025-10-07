// components/settings/vision/vision-layout.tsx
"use client";

import * as React from "react";
import EnabledRow from "./enabled/EnabledRow";

// Simple, single-boolean vision setting
const ENABLED_KEY = "vision:enabled:v1";
const BUS_EVENT = "vision:enabled-changed";

function readEnabled(): boolean {
  try {
    const raw = localStorage.getItem(ENABLED_KEY);
    if (raw == null) return true; // default ON
    return raw === "1" || raw === "true";
  } catch {
    return true;
  }
}

function writeEnabled(next: boolean) {
  try {
    localStorage.setItem(ENABLED_KEY, next ? "1" : "0");
  } catch {}
  window.dispatchEvent(new CustomEvent(BUS_EVENT, { detail: { enabled: next } }));
}

type Ctx = { enabled: boolean; setEnabled: (next: boolean) => void };
const VisionCtx = React.createContext<Ctx | null>(null);

/**
 * Works both inside and outside the provider.
 * If there’s no provider (e.g., TrainingGame route), it falls back to
 * localStorage + a window event bus so state is shared app-wide.
 */
export function useVisionEnabled(): Ctx {
  const ctx = React.useContext(VisionCtx);

  const [fallbackEnabled, setFallbackEnabled] = React.useState<boolean>(() =>
    typeof window !== "undefined" ? readEnabled() : true
  );

  React.useEffect(() => {
    if (ctx) return; // provider handles reactivity
    const onChange = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      setFallbackEnabled(!!detail?.enabled);
    };
    window.addEventListener(BUS_EVENT, onChange as any);
    return () => window.removeEventListener(BUS_EVENT, onChange as any);
  }, [ctx]);

  const setEnabled = React.useCallback(
    (next: boolean) => {
      if (ctx) {
        ctx.setEnabled(next);
      } else {
        setFallbackEnabled(next);
        writeEnabled(next);
      }
    },
    [ctx]
  );

  return ctx ?? { enabled: fallbackEnabled, setEnabled };
}

export default function VisionLayout() {
  const [enabled, setEnabledState] = React.useState<boolean>(readEnabled);

  const setEnabled = React.useCallback((next: boolean) => {
    setEnabledState(next);
    writeEnabled(next);
  }, []);

  const value: Ctx = { enabled, setEnabled };

  return (
    <VisionCtx.Provider value={value}>
      <div className="space-y-8">
        <EnabledRow />
      </div>
    </VisionCtx.Provider>
  );
}
