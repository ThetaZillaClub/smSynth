// components/settings/gameplay/key/KeyRow.tsx
"use client";

import * as React from "react";
import useStudentRange from "@/hooks/students/useStudentRange";
import { hzToMidi } from "@/utils/pitch/pitchMath";

type Choice = "random" | number; // number = tonicPc (0..11)

const STORE_KEY = "gameplay:keyChoice";
const PC_SHARPS = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"] as const;

function read(): Choice {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw === "random" || raw == null) return "random";
    const n = Number(raw);
    return Number.isFinite(n) && n >= 0 && n <= 11 ? (n as number) : "random";
  } catch {
    return "random";
  }
}

export default function KeyRow() {
  // Filter keys by saved range (tonic to tonic+octave must fit).
  const { lowHz, highHz } = useStudentRange(null, { rangeLowLabel: null, rangeHighLabel: null });

  const [choice, setChoice] = React.useState<Choice>(read());
  const set = (v: Choice) => {
    setChoice(v);
    try { localStorage.setItem(STORE_KEY, String(v)); } catch {}
  };

  const allowed = React.useMemo(() => {
    if (lowHz == null || highHz == null) return new Set<number>();
    const loM = Math.round(hzToMidi(Math.min(lowHz, highHz)));
    const hiM = Math.round(hzToMidi(Math.max(lowHz, highHz)));
    const maxTonic = hiM - 12;
    if (maxTonic < loM) return new Set<number>();
    const set = new Set<number>();
    for (let m = loM; m <= maxTonic; m++) set.add(((m % 12) + 12) % 12);
    return set;
  }, [lowHz, highHz]);

  const pcsSorted = React.useMemo(() => Array.from(allowed).sort((a, b) => a - b), [allowed]);

  const btnBase = "px-2.5 py-1 text-sm rounded-md border transition";
  const selected = "bg-[#fdfdfd] font-medium border-[#d2d2d2]";
  const idle = "bg-[#f2f2f2] hover:bg-[#f6f6f6] border-[#dcdcdc]";

  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm font-medium text-[#0f0f0f]">Key</span>
      <div className="flex flex-wrap items-center gap-1">
        <button
          type="button"
          onClick={() => set("random")}
          className={[btnBase, choice === "random" ? selected : idle].join(" ")}
        >
          Random
        </button>

        {pcsSorted.map((pc) => (
          <button
            key={pc}
            type="button"
            onClick={() => set(pc)}
            className={[btnBase, choice === pc ? selected : idle].join(" ")}
            title={PC_SHARPS[pc]}
          >
            {PC_SHARPS[pc]}
          </button>
        ))}
      </div>
    </div>
  );
}
