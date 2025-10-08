// components/settings/gameplay/key/KeyRow.tsx
"use client";

import * as React from "react";
import { createClient } from "@/lib/supabase/client";
import { ensureSessionReady, getCurrentStudentRowCached } from "@/lib/client-cache";
import { hzToMidi } from "@/utils/pitch/pitchMath";

type Choice = "random" | number; // number = tonicPc (0..11)

const STORE_KEY = "gameplay:keyChoice";
const PC_SHARPS = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"] as const;

/** Parse labels like C3, F#4, Db4 into Hz. */
function noteLabelToHz(label: string | null | undefined): number | null {
  if (!label) return null;
  const m = /^([A-Ga-g])([#b]?)(\d{1,2})$/.exec(label.trim());
  if (!m) return null;
  const name = m[1].toUpperCase();
  const acc = m[2];
  const oct = Number(m[3]);

  // map to semitone (C=0)
  const base: Record<string, number> = { C:0, D:2, E:4, F:5, G:7, A:9, B:11 };
  let pc = base[name];
  if (pc == null) return null;
  if (acc === "#") pc += 1;
  if (acc === "b") pc -= 1;
  // wrap into 0..11
  pc = ((pc % 12) + 12) % 12;

  const midi = (oct + 1) * 12 + pc;        // MIDI 0 = C-1
  const hz = 440 * Math.pow(2, (midi - 69) / 12); // A4=440
  return hz;
}

function readChoice(): Choice {
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
  const supabase = React.useMemo(() => createClient(), []);
  const [choice, setChoice] = React.useState<Choice>(readChoice());
  const [lowHz, setLowHz] = React.useState<number | null>(null);
  const [highHz, setHighHz] = React.useState<number | null>(null);

  // Load the current student row ONCE via cached endpoint; no /range call.
  React.useEffect(() => {
    let cancel = false;
    (async () => {
      await ensureSessionReady(supabase, 2000);
      const row = await getCurrentStudentRowCached(supabase);
      if (cancel) return;

      const lo = noteLabelToHz(row?.range_low);
      const hi = noteLabelToHz(row?.range_high);
      setLowHz(lo);
      setHighHz(hi);
    })();
    return () => { cancel = true; };
  }, [supabase]);

  const set = (v: Choice) => {
    setChoice(v);
    try { localStorage.setItem(STORE_KEY, String(v)); } catch {}
  };

  // Build allowed tonic pitch-classes (tonic..tonic+12 must fit inside range)
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
