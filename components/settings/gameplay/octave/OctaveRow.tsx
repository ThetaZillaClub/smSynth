// components/settings/gameplay/octave/OctaveRow.tsx
"use client";
import * as React from "react";

type OctPref = "low" | "high";
const KEY = "gameplay:octavePref";

function read(): OctPref {
  try {
    const raw = localStorage.getItem(KEY);
    return raw === "high" ? "high" : "low";
  } catch {
    return "low";
  }
}

export default function OctaveRow() {
  const [pref, setPref] = React.useState<OctPref>(read());
  const set = (v: OctPref) => {
    setPref(v);
    try { localStorage.setItem(KEY, v); } catch {}
  };

  const segBase = "px-3 py-1.5 text-sm transition";
  const sel = "bg-[#fdfdfd] font-medium";
  const idle = "bg-[#f2f2f2] hover:bg-[#f6f6f6]";

  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm font-medium text-[#0f0f0f]">Octave preference</span>
      <div className="inline-flex rounded-md overflow-hidden border border-[#dcdcdc]">
        <button
          type="button"
          onClick={() => set("low")}
          className={[segBase, pref === "low" ? sel : idle].join(" ")}
        >
          Low
        </button>
        <button
          type="button"
          onClick={() => set("high")}
          className={[segBase, "border-l border-[#dcdcdc]", pref === "high" ? sel : idle].join(" ")}
        >
          High
        </button>
      </div>
    </div>
  );
}
