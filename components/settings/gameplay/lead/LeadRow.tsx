// components/settings/gameplay/lead/LeadRow.tsx
"use client";
import * as React from "react";

const KEY = "gameplay:leadBars";
function read(): 1 | 2 {
  try {
    const raw = localStorage.getItem(KEY);
    const n = raw == null ? 1 : Math.round(Number(raw));
    return n === 2 ? 2 : 1;
  } catch {
    return 1;
  }
}

export default function LeadRow() {
  const [value, setValue] = React.useState<1 | 2>(read());
  const set = (v: 1 | 2) => {
    setValue(v);
    try { localStorage.setItem(KEY, String(v)); } catch {}
  };

  const segBase = "px-3 py-1.5 text-sm transition";
  const sel = "bg-[#fdfdfd] font-medium";
  const idle = "bg-[#f2f2f2] hover:bg-[#f6f6f6]";

  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm font-medium text-[#0f0f0f]">Lead-in bars</span>
      <div className="inline-flex rounded-md overflow-hidden border border-[#dcdcdc]">
        <button
          type="button"
          onClick={() => set(1)}
          className={[segBase, value === 1 ? sel : idle].join(" ")}
        >
          1
        </button>
        <button
          type="button"
          onClick={() => set(2)}
          className={[segBase, "border-l border-[#dcdcdc]", value === 2 ? sel : idle].join(" ")}
        >
          2
        </button>
      </div>
    </div>
  );
}
