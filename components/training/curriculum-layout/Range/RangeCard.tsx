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

  // --- helpers ---
  const loHiM = useMemo(() => {
    if (lowHz == null || highHz == null) return null;
    const loM = Math.round(hzToMidi(Math.min(lowHz, highHz)));
    const hiM = Math.round(hzToMidi(Math.max(lowHz, highHz)));
    return { loM, hiM };
  }, [lowHz, highHz]);

  const inScale = (m: number) => isInScale((((m % 12) + 12) % 12), tonicPc, scaleName);

  const spanScaleNotes = (a: number, b: number) => {
    const out: number[] = [];
    for (let m = a; m <= b; m++) if (inScale(m)) out.push(m);
    return out;
  };

  // ---- Available tonic windows inside saved range ----
  const { candidates, labels } = useMemo(() => {
    if (!loHiM) return { candidates: [] as number[], labels: [] as string[] };
    const { loM, hiM } = loHiM;
    const out: number[] = [];
    const lbl: string[] = [];
    for (let m = loM; m <= hiM - 12; m++) {
      if ((((m % 12) + 12) % 12) !== tonicPc) continue;
      out.push(m);
      const { name, octave } = midiToNoteName(m, { useSharps: true, octaveAnchor: "C" });
      const hiName = midiToNoteName(m + 12, { useSharps: true, octaveAnchor: "C" });
      lbl.push(`${name}${octave}–${hiName.name}${hiName.octave}`);
    }
    return { candidates: out, labels: lbl };
  }, [loHiM, tonicPc]);

  // Current selected windows
  const selected = new Set<number>((cfg.tonicMidis ?? []) as number[]);
  const selectedList = useMemo(() => Array.from(selected).sort((a, b) => a - b), [selected]);

  // ---- Per-window note lists (scale-aware) ----
  const perWindowNotes = useMemo(() => {
    if (!loHiM || !selectedList.length) return [] as Array<{ tonic: number; label: string; notes: number[]; noteLabels: string[] }>;
    const out: Array<{ tonic: number; label: string; notes: number[]; noteLabels: string[] }> = [];
    for (const T of selectedList) {
      const notes: number[] = [];
      const labels: string[] = [];
      for (let m = T; m <= T + 12; m++) {
        if (inScale(m)) {
          notes.push(m);
          const { name, octave } = midiToNoteName(m, { useSharps: true, octaveAnchor: "C" });
          labels.push(`${name}${octave}`);
        }
      }
      const loName = midiToNoteName(T, { useSharps: true });
      const hiName = midiToNoteName(T + 12, { useSharps: true });
      out.push({ tonic: T, label: `${loName.name}${loName.octave}–${hiName.name}${hiName.octave}`, notes, noteLabels: labels });
    }
    return out;
  }, [loHiM, selectedList, scaleName, tonicPc]);

  // ---- Extended regions (under/over) for Random mode ----
  const showRandomOptions = (cfg.rhythm as any)?.mode === "random";
  const extended = useMemo(() => {
    if (!loHiM || !selectedList.length) {
      return {
        under: [] as number[],
        underLabels: [] as string[],
        over: [] as number[],
        overLabels: [] as string[],
        hasAny: false,
      };
    }
    const { loM, hiM } = loHiM;
    const minStart = selectedList[0];
    const maxEnd = selectedList[selectedList.length - 1] + 12;
    const underRange = minStart > loM ? [loM, minStart - 1] : null;
    const overRange = maxEnd < hiM ? [maxEnd + 1, hiM] : null;

    const under = underRange ? spanScaleNotes(underRange[0], underRange[1]) : [];
    const over = overRange ? spanScaleNotes(overRange[0], overRange[1]) : [];

    const toLabels = (arr: number[]) =>
      arr.map((m) => {
        const { name, octave } = midiToNoteName(m, { useSharps: true, octaveAnchor: "C" });
        return `${name}${octave}`;
      });

    return {
      under,
      underLabels: toLabels(under),
      over,
      overLabels: toLabels(over),
      hasAny: !!(under.length || over.length),
    };
  }, [loHiM, selectedList, scaleName, tonicPc]);

  // Universe of selectable notes = selected windows (+ optionally extended under/over)
  const universeAll = useMemo(() => {
    const base: number[] = [];
    perWindowNotes.forEach((w) => base.push(...w.notes));
    if (showRandomOptions && cfg.randomIncludeUnder) base.push(...extended.under);
    if (showRandomOptions && cfg.randomIncludeOver) base.push(...extended.over);
    return Array.from(new Set(base)).sort((a, b) => a - b);
  }, [perWindowNotes, extended, showRandomOptions, cfg.randomIncludeUnder, cfg.randomIncludeOver]);

  // Current per-note selection (null/empty ⇒ all eligible)
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

  const setExtendedAll = (kind: "under" | "over", select: boolean) => {
    const pool = kind === "under" ? extended.under : extended.over;
    const base = new Set(selectedNotes.size ? Array.from(selectedNotes) : universeAll);
    if (select) pool.forEach((m) => base.add(m));
    else pool.forEach((m) => base.delete(m));
    commitNotes(base);
  };

  // Toggle a tonic window (preserve extended-note picks when applicable)
  const toggleTonic = (m: number, next: boolean) => {
    const arr = new Set(selected);
    if (next) arr.add(m);
    else arr.delete(m);
    const nextWindows = Array.from(arr).sort((a, b) => a - b);

    // If no explicit whitelist, just update windows
    const whitelist = new Set<number>((cfg.allowedMidis ?? []) as number[]);
    if (!whitelist.size) {
      onChange({ tonicMidis: nextWindows });
      return;
    }

    // Recompute keep set = notes inside new windows (+ extended if enabled)
    // Build windows notes
    const windowKeep = new Set<number>();
    for (const T of nextWindows) {
      for (let k = T; k <= T + 12; k++) if (inScale(k)) windowKeep.add(k);
    }

    // Extended (under/over) relative to *new* windows
    if (loHiM && nextWindows.length) {
      const { loM, hiM } = loHiM;
      const minStart = nextWindows[0];
      const maxEnd = nextWindows[nextWindows.length - 1] + 12;
      if (cfg.randomIncludeUnder && loM < minStart) {
        for (let k = loM; k < minStart; k++) if (inScale(k)) windowKeep.add(k);
      }
      if (cfg.randomIncludeOver && maxEnd < hiM) {
        for (let k = maxEnd + 1; k <= hiM; k++) if (inScale(k)) windowKeep.add(k);
      }
    }

    const keep = Array.from(whitelist).filter((m) => windowKeep.has(m)).sort((a, b) => a - b);
    const allEligible = universeAll; // current eligible based on existing UI state
    const keepEqualsAll = keep.length === allEligible.length && keep.every((x, i) => x === allEligible[i]);

    onChange({
      tonicMidis: nextWindows,
      allowedMidis: keepEqualsAll ? null : keep,
    });
  };

  const noneAvailable = candidates.length === 0;

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
          Select one or more tonic windows to anchor phrases. Then fine-tune the allowed notes below.
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
            Pick specific notes from the selected window(s). If you leave everything checked, we’ll use every scale tone in the eligible area.
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
        </div>
      ) : null}

      {/* Random-mode extended options */}
      {showRandomOptions ? (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3">
            <Field label="Also include notes UNDER lowest selected tonic (random mode)">
              <FancyCheckbox
                checked={!!cfg.randomIncludeUnder}
                onChange={(v) => {
                  // If user turns it on and we’re “all eligible”, keep that behavior; otherwise preserve whitelist.
                  onChange({ randomIncludeUnder: v, allowedMidis: cfg.allowedMidis ?? null });
                }}
                label={<span>{cfg.randomIncludeUnder ? "Yes" : "No"}</span>}
              />
            </Field>
            <Field label="Also include notes ABOVE highest selected tonic (random mode)">
              <FancyCheckbox
                checked={!!cfg.randomIncludeOver}
                onChange={(v) => {
                  onChange({ randomIncludeOver: v, allowedMidis: cfg.allowedMidis ?? null });
                }}
                label={<span>{cfg.randomIncludeOver ? "Yes" : "No"}</span>}
              />
            </Field>
          </div>

          {(cfg.randomIncludeUnder && extended.under.length) || (cfg.randomIncludeOver && extended.over.length) ? (
            <div className="mt-3 space-y-2">
              <div className="text-xs text-[#2d2d2d] -mb-1">
                Extended regions (still within your saved range):
              </div>

              {cfg.randomIncludeUnder && extended.under.length ? (
                <div className="rounded-md border border-[#d2d2d2] bg-[#f5f5f5] p-2">
                  <div className="flex items-center justify-between mb-1">
                    <div className="text-xs font-semibold">Under lowest window</div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        className="text-xs underline underline-offset-2"
                        onClick={() => setExtendedAll("under", true)}
                      >
                        Select all
                      </button>
                      <button
                        type="button"
                        className="text-xs underline underline-offset-2"
                        onClick={() => setExtendedAll("under", false)}
                      >
                        Clear
                      </button>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {extended.under.map((m, idx) => (
                      <FancyCheckbox
                        key={`u-${m}`}
                        checked={selectedNotes.has(m)}
                        onChange={(next) => toggleNote(m, next)}
                        label={extended.underLabels[idx]}
                        className="px-1 py-0.5"
                      />
                    ))}
                  </div>
                </div>
              ) : null}

              {cfg.randomIncludeOver && extended.over.length ? (
                <div className="rounded-md border border-[#d2d2d2] bg-[#f5f5f5] p-2">
                  <div className="flex items-center justify-between mb-1">
                    <div className="text-xs font-semibold">Above highest window</div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        className="text-xs underline underline-offset-2"
                        onClick={() => setExtendedAll("over", true)}
                      >
                        Select all
                      </button>
                      <button
                        type="button"
                        className="text-xs underline underline-offset-2"
                        onClick={() => setExtendedAll("over", false)}
                      >
                        Clear
                      </button>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {extended.over.map((m, idx) => (
                      <FancyCheckbox
                        key={`o-${m}`}
                        checked={selectedNotes.has(m)}
                        onChange={(next) => toggleNote(m, next)}
                        label={extended.overLabels[idx]}
                        className="px-1 py-0.5"
                      />
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
        </>
      ) : null}

      {/* Quick actions */}
      <div className="flex items-center gap-3 pt-3">
        <button
          type="button"
          className="text-xs underline underline-offset-2"
          onClick={() => onChange({ allowedMidis: null })}
        >
          Use all eligible notes
        </button>
      </div>

      <div className="text-xs text-[#6b6b6b] mt-3">
        Tip: Selecting B2–B3 (but not B3–B4) yields phrases that stay in that lower octave — stabilizing the printed clef in sheet view.
      </div>
    </div>
  );
}
