// components/settings/gameplay/view/ViewRow.tsx
"use client";
import * as React from "react";

export type ViewPref = "piano" | "sheet";
const KEY = "gameplay:viewPref";

function read(): ViewPref {
  try {
    const raw = (localStorage.getItem(KEY) || "").toLowerCase();
    return raw === "sheet" ? "sheet" : "piano"; // default: Piano Roll
  } catch {
    return "piano";
  }
}

export default function ViewRow() {
  const [pref, setPref] = React.useState<ViewPref>(read());
  const set = (v: ViewPref) => {
    setPref(v);
    try { localStorage.setItem(KEY, v); } catch {}
  };

  // Match the segmented-button look from other rows
  const segBase = "px-3 py-1.5 text-sm transition";
  const selected = "bg-[#fdfdfd] active:bg-[#fcfcfc] font-medium";
  const idle = "bg-[#f2f2f2] hover:bg-[#f6f6f6] active:bg-[#f6f6f6]";

  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm font-medium text-[#0f0f0f]">View Preference</span>
      <div className="inline-flex rounded-md overflow-hidden border border-[#dcdcdc]">
        <button
          type="button"
          onClick={() => set("piano")}
          className={[segBase, pref === "piano" ? selected : idle].join(" ")}
        >
          Piano Roll
        </button>
        <button
          type="button"
          onClick={() => set("sheet")}
          className={[segBase, "border-l border-[#dcdcdc]", pref === "sheet" ? selected : idle].join(" ")}
        >
          Sheet Music
        </button>
      </div>
    </div>
  );
}
