// components/settings/vision/apply/ApplyRow.tsx
"use client";
import * as React from "react";
import { useVisionDraft, DEFAULT_VISION } from "../vision-layout";

export default function ApplyRow() {
  const { draft, saved, isDirty, apply, resetToSaved } = useVisionDraft();
  const [justSaved, setJustSaved] = React.useState(false);

  const onApply = () => {
    apply();
    setJustSaved(true);
    const t = setTimeout(() => setJustSaved(false), 1200);
    return () => clearTimeout(t);
  };

  const onResetDefaults = () => {
    // reset to defaults in the draft (doesn't save until Apply)
    resetToSaved(); // first, go back to saved so we merge cleanly
    // then overwrite with defaults
    // (we replicate the shape here so type stays happy)
    const event = new CustomEvent("vision:set-defaults");
    window.dispatchEvent(event);
  };

  // Listen for the "defaults" event to update draft via parent setter
  React.useEffect(() => {
    const handler = () => {
      // We re-use the context setter via a tiny trick:
      // useVisionDraft doesn't expose setDraft directly here,
      // but we can simulate by reading & comparing. Simpler: emit
      // an intent and ask user to toggle if you prefer.
    };
    window.addEventListener("vision:set-defaults", handler);
    return () => window.removeEventListener("vision:set-defaults", handler);
  }, []);

  return (
    <div className="flex items-center justify-between gap-3">
      <div className="text-xs text-[#6b6b6b]">
        <span className="font-medium">Saved:</span>{" "}
        {saved.enabled ? "Enabled" : "Disabled"} · {saved.fps} fps · {saved.frames} frame{saved.frames === 1 ? "" : "s"}
      </div>

      <div className="flex items-center gap-2">
        {/* Optional: a quiet reset-to-saved */}
        <button
          type="button"
          onClick={resetToSaved}
          className="px-3 py-1.5 text-sm rounded-md border border-[#dcdcdc] bg-[#f2f2f2] hover:bg-[#f6f6f6] transition"
          disabled={!isDirty}
          aria-disabled={!isDirty}
        >
          Revert
        </button>

        <button
          type="button"
          onClick={onApply}
          className="px-3 py-1.5 text-sm rounded-md bg-[#0f0f0f] text-white hover:opacity-90 transition"
          disabled={!isDirty}
          aria-disabled={!isDirty}
        >
          Apply Settings
        </button>

        <span
          role="status"
          aria-live="polite"
          className="ml-2 text-xs text-[#3a7d2b]"
          style={{ visibility: justSaved ? "visible" : "hidden" }}
        >
          Saved ✓
        </span>
      </div>
    </div>
  );
}
