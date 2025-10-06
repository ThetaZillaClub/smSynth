// components/settings/gameplay/autoplay/AutoplayRow.tsx
"use client";
import * as React from "react";

type Mode = "on" | "off";
const KEY = "gameplay:autoplay";

function read(): Mode {
  try {
    const raw = localStorage.getItem(KEY);
    return raw === "off" ? "off" : "on"; // default ON
  } catch {
    return "on";
  }
}

export default function AutoplayRow() {
  const [mode, setMode] = React.useState<Mode>(read());
  const set = (v: Mode) => {
    setMode(v);
    try {
      localStorage.setItem(KEY, v);
    } catch {}
  };

  // Shared button styles (match sidebar/buttons spec)
  const segBase = "px-3 py-1.5 text-sm transition";
  const selected = "bg-[#fdfdfd] active:bg-[#fcfcfc] font-medium";
  const idle = "bg-[#f2f2f2] hover:bg-[#f6f6f6] active:bg-[#f6f6f6]";

  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm font-medium text-[#0f0f0f]">Autoplay</span>
      <div className="inline-flex rounded-md overflow-hidden border border-[#dcdcdc]">
        <button
          type="button"
          onClick={() => set("off")}
          className={[segBase, mode === "off" ? selected : idle].join(" ")}
        >
          Off
        </button>
        <button
          type="button"
          onClick={() => set("on")}
          className={[segBase, "border-l border-[#dcdcdc]", mode === "on" ? selected : idle].join(" ")}
        >
          On
        </button>
      </div>
    </div>
  );
}
