// components/settings/vision/vision-layout.tsx
"use client";

import * as React from "react";
import EnabledRow from "./enabled/EnabledRow";
import FpsRow from "./fps/FpsRow";
import ResolutionRow from "./resolution/ResolutionRow"; // ← swapped in
import ApplyRow from "./apply/ApplyRow";

export type DetectionResolution = "medium" | "high";

export type VisionSettings = {
  enabled: boolean;
  fps: number;                 // 5..60
  frames: number;              // always 1 (kept for ApplyRow display)
  resolution: DetectionResolution;
};

const STORAGE_KEY = "vision:settings:v1";
export const DEFAULT_VISION: VisionSettings = {
  enabled: true,
  fps: 30,
  frames: 1,                   // ← force parse-every-frame
  resolution: "medium",
};

function readSettings(): VisionSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_VISION;
    const parsed = JSON.parse(raw);
    const enabled =
      typeof parsed?.enabled === "boolean" ? parsed.enabled : DEFAULT_VISION.enabled;
    const fps = Number.isFinite(parsed?.fps)
      ? Math.max(5, Math.min(60, Math.round(parsed.fps)))
      : DEFAULT_VISION.fps;
    // frames are always 1 now, regardless of stored value
    const frames = 1;
    const resolution: DetectionResolution =
      parsed?.resolution === "high" || parsed?.resolution === "medium"
        ? parsed.resolution
        : DEFAULT_VISION.resolution;

    return { enabled, fps, frames, resolution };
  } catch {
    return DEFAULT_VISION;
  }
}

function saveSettings(s: VisionSettings) {
  try {
    // ensure frames stays 1 on save as well
    const payload = { ...s, frames: 1 };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {}
}

// ---------- Draft context ----------
type Ctx = {
  saved: VisionSettings;
  draft: VisionSettings;
  setDraft: (u: Partial<VisionSettings>) => void;
  isDirty: boolean;
  apply: () => void;
  resetToSaved: () => void;
};
const VisionCtx = React.createContext<Ctx | null>(null);

export function useVisionDraft() {
  const ctx = React.useContext(VisionCtx);
  if (!ctx) throw new Error("useVisionDraft must be used within <VisionLayout>");
  return ctx;
}

export default function VisionLayout() {
  const [saved, setSaved] = React.useState<VisionSettings>(readSettings);
  const [draft, setDraftState] = React.useState<VisionSettings>(saved);

  const setDraft = (u: Partial<VisionSettings>) =>
    setDraftState((d) => ({ ...d, ...u, frames: 1 })); // keep frames locked to 1

  const isDirty =
    saved.enabled !== draft.enabled ||
    saved.fps !== draft.fps ||
    saved.frames !== draft.frames ||            // remains stable (1 === 1) unless older saved state differs
    saved.resolution !== draft.resolution;

  const apply = () => {
    const next = { ...draft, frames: 1 };
    saveSettings(next);
    setSaved(next);
    setDraftState(next);
  };

  const resetToSaved = () => setDraftState({ ...saved, frames: 1 });

  const value: Ctx = { saved, draft, setDraft, isDirty, apply, resetToSaved };

  return (
    <VisionCtx.Provider value={value}>
      <div className="space-y-8">
        <EnabledRow />
        <FpsRow />
        <ResolutionRow /> {/* ← replaces <FramesRow /> */}
        <ApplyRow />
      </div>
    </VisionCtx.Provider>
  );
}
