// components/training/curriculum-layout/Range/RangeCard.tsx
"use client";
import React, { useMemo } from "react";
import type { SessionConfig } from "../../session/types";
import Field from "../Field";
import { hzToMidi, midiToNoteName } from "@/utils/pitch/pitchMath";
import { isInScale, type ScaleName } from "@/utils/phrase/scales";

function FancyCheckbox({
  checked,
  onChange,
  label,
  className = "",
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label?: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`inline-flex items-center gap-2 select-none ${className}`}
    >
      <span
        className={[
          "relative inline-flex h-4 w-4 shrink-0 items-center justify-center",
          "rounded-[4px] border",
          "bg-[#f5f5f5] border-[#d2d2d2]",
        ].join(" ")}
      >
        {checked ? (
          <svg
            viewBox="0 0 20 20"
            aria-hidden="true"
            className="h-3 w-3"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="4,10 8,14 16,6" />
          </svg>
        ) : null}
      </span>
      {label ? <span className="text-sm">{label}</span> : null}
    </button>
  );
}

export default function RangeCard({
  cfg,
  lowHz,
  highHz,
  onChange,
}: {
  cfg: SessionConfig;
  lowHz: number | null;
  highHz: number | null;
  onChange: (patch: Partial<SessionConfig>) => void;
}) {
  const tonicPc = (cfg.scale?.tonicPc ?? 0) % 12;
  const scaleName = (cfg.scale?.name ?? "major") as ScaleName;

  const { candidates, labels } = useMemo(() => {
    if (lowHz == null || highHz == null) return { candidates: [] as number[], labels: [] as string[] };

    const loM = Math.round(hzToMidi(Math.min(lowHz, highHz)));
    const hiM = Math.round(hzToMidi(Math.max(lowHz, highHz)));
    const out: number[] = [];
    const lbl: string[] = [];

    // A tonic at MIDI T represents the octave window [T, T+12]
    for (let m = loM; m <= hiM - 12; m++) {
      if ((((m % 12) + 12) % 12) !== tonicPc) continue;
      out.push(m);
      const { name, octave } = midiToNoteName(m, { useSharps: true, octaveAnchor: "C" });
      const hiName = midiToNoteName(m + 12, { useSharps: true, octaveAnchor: "C" });
      lbl.push(`${name}${octave}–${hiName.name}${hiName.octave}`);
    }
    return { candidates: out, labels: lbl };
  }, [lowHz, highHz, tonicPc]);

  // Ensure stable selection shape
  const selected = new Set<number>((cfg.tonicMidis ?? []) as number[]);

  const toggleTonic = (m: number, next: boolean) => {
    const arr = new Set(selected);
    if (next) arr.add(m);
    else arr.delete(m);

    // Also prune any per-note whitelist that falls outside new windows
    const nextWindows = Array.from(arr).sort((a, b) => a - b);
    const whitelist = new Set<number>((cfg.allowedMidis ?? []) as number[]);
    if (whitelist.size) {
      const keep = new Set<number>();
      for (const T of nextWindows) {
        for (let k = T; k <= T + 12; k++) {
          if (whitelist.has(k)) keep.add(k);
        }
      }
      onChange({ tonicMidis: nextWindows, allowedMidis: Array.from(keep).sort((a, b) => a - b) });
    } else {
      onChange({ tonicMidis: nextWindows });
    }
  };

  const showRandomOptions = (cfg.rhythm as any)?.mode === "random";

  const noneAvailable = candidates.length === 0;

  // ---------- Per-note universe inside selected windows (scale-aware) ----------
  const perWindowNotes = useMemo(() => {
    const out: Array<{ tonic: number; label: string; notes: number[]; noteLabels: string[] }> = [];
    if (!selected.size || lowHz == null || highHz == null) return out;
    const selectedList = Array.from(selected).sort((a, b) => a - b);
    for (const T of selectedList) {
      const notes: number[] = [];
      const labels: string[] = [];
      for (let m = T; m <= T + 12; m++) {
        const pc = ((m % 12) + 12) % 12;
        if (isInScale(pc, tonicPc, scaleName)) {
          notes.push(m);
          const { name, octave } = midiToNoteName(m, { useSharps: true, octaveAnchor: "C" });
          labels.push(`${name}${octave}`);
        }
      }
      const lo = midiToNoteName(T, { useSharps: true });
      const hi = midiToNoteName(T + 12, { useSharps: true });
      out.push({ tonic: T, label: `${lo.name}${lo.octave}–${hi.name}${hi.octave}`, notes, noteLabels: labels });
    }
    return out;
  }, [selected, lowHz, highHz, tonicPc, scaleName]);

  // Whole-universe (all scale notes across selected windows)
  const universeAll = useMemo(() => {
    const arr: number[] = [];
    perWindowNotes.forEach((w) => arr.push(...w.notes));
    // de-dup shared boundary notes across adjacent windows
    return Array.from(new Set(arr)).sort((a, b) => a - b);
  }, [perWindowNotes]);

  // Current selection (null ⇒ “all”), rendered as checked by default
  const selectedNotes = useMemo(() => {
    if (!cfg.allowedMidis || !cfg.allowedMidis.length) return new Set(universeAll);
    return new Set(cfg.allowedMidis.map((m) => Math.round(m)));
  }, [cfg.allowedMidis, universeAll]);

  const commitNotes = (nextSet: Set<number>) => {
    const next = Array.from(nextSet).sort((a, b) => a - b);
    const allSelected = next.length === universeAll.length && next.every((m, i) => m === universeAll[i]);
    onChange({ allowedMidis: allSelected ? null : next });
  };

  const toggleNote = (m: number, next: boolean) => {
    const base = new Set(selectedNotes.size ? Array.from(selectedNotes) : universeAll);
    if (next) base.add(m); else base.delete(m);
    commitNotes(base);
  };

  const setWindowAll = (tonic: number, select: boolean) => {
    const base = new Set(selectedNotes.size ? Array.from(selectedNotes) : universeAll);
    const window = perWindowNotes.find((w) => w.tonic === tonic);
    if (!window) return;
    if (select) window.notes.forEach((m) => base.add(m));
    else window.notes.forEach((m) => base.delete(m));
    commitNotes(base);
  };

  return (
    <div className="rounded-lg border border-[#d2d2d2] bg-[#ebebeb] p-3">
      <div className="text-[11px] uppercase tracking-wide text-[#6b6b6b] mb-2">
        Range / Tonic Windows
      </div>

      {noneAvailable ? (
        <div className="text-xs text-red-600 mb-2">
          No full octave fits the current vocal range for this key. Try a different key or update the range.
        </div>
      ) : (
        <div className="text-xs text-[#2d2d2d] mb-2">
          Select one or more tonic windows to anchor phrases.
        </div>
      )}

      <Field label="Available tonic windows (1 window = tonic→tonic+octave)">
        <div className="flex flex-wrap gap-2">
          {candidates.map((m, i) => (
            <FancyCheckbox
              key={m}
              checked={selected.has(m)}
              onChange={(next) => toggleTonic(m, next)}
              label={labels[i]}
            />
          ))}
          {candidates.length === 0 ? <span className="text-sm opacity-70">None</span> : null}
        </div>
      </Field>

      {/* Per-note precision inside selected windows */}
      {perWindowNotes.length ? (
        <div className="mt-3 space-y-2">
          <div className="text-xs text-[#2d2d2d]">
            Pick specific notes from the selected window(s). If you leave all checked, we’ll use every scale tone in those window(s).
          </div>
          {perWindowNotes.map((w) => (
            <div key={w.tonic} className="rounded-md border border-[#d2d2d2] bg-[#f5f5f5] p-2">
              <div className="flex items-center justify-between mb-1">
                <div className="text-xs font-semibold">{w.label}</div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="text-xs underline underline-offset-2"
                    onClick={() => setWindowAll(w.tonic, true)}
                  >
                    Select all
                  </button>
                  <button
                    type="button"
                    className="text-xs underline underline-offset-2"
                    onClick={() => setWindowAll(w.tonic, false)}
                  >
                    Clear
                  </button>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {w.notes.map((m, idx) => (
                  <FancyCheckbox
                    key={m}
                    checked={selectedNotes.has(m)}
                    onChange={(next) => toggleNote(m, next)}
                    label={w.noteLabels[idx]}
                    className="px-1 py-0.5"
                  />
                ))}
              </div>
            </div>
          ))}
          <div className="flex items-center gap-3 pt-1">
            <button
              type="button"
              className="text-xs underline underline-offset-2"
              onClick={() => onChange({ allowedMidis: null })}
            >
              Use all notes in selected windows
            </button>
          </div>
        </div>
      ) : null}

      {showRandomOptions ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3">
          <Field label="Also include notes UNDER lowest selected tonic (random mode)">
            <FancyCheckbox
              checked={!!cfg.randomIncludeUnder}
              onChange={(v) => onChange({ randomIncludeUnder: v })}
              label={<span>{cfg.randomIncludeUnder ? "Yes" : "No"}</span>}
            />
          </Field>
          <Field label="Also include notes ABOVE highest selected tonic (random mode)">
            <FancyCheckbox
              checked={!!cfg.randomIncludeOver}
              onChange={(v) => onChange({ randomIncludeOver: v })}
              label={<span>{cfg.randomIncludeOver ? "Yes" : "No"}</span>}
            />
          </Field>
        </div>
      ) : null}

      <div className="text-xs text-[#6b6b6b] mt-3">
        Tip: Selecting B2–B3 (but not B3–B4) yields phrases that stay in that lower octave —
        stabilizing the printed clef in sheet view.
      </div>
    </div>
  );
}
