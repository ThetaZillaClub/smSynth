// components/training/curriculum-layout/CallResponse/CallResponseCard.tsx
"use client";

import React from "react";
import type { SessionConfig, CRMode } from "../../session/types";
import Field from "../Field";

type Row = { id: string; label: string; kind: CRMode["kind"] };

const ALL: Row[] = [
  { id: "single_tonic", label: "Single Pitch (tonic)", kind: "single_tonic" },
  { id: "derived_tonic", label: "Derived Tonic (A440 → tonic)", kind: "derived_tonic" },
  { id: "guided_arpeggio", label: "Guided Arpeggio (teacher prompt)", kind: "guided_arpeggio" },
  { id: "internal_arpeggio", label: "Internal Arpeggio (no prompt)", kind: "internal_arpeggio" },
];

export default function CallResponseCard({
  cfg,
  onChange,
}: {
  cfg: SessionConfig;
  onChange: (patch: Partial<SessionConfig>) => void;
}) {
  const sequence = cfg.callResponseSequence ?? [];

  const inSeq = (kind: Row["kind"]) =>
    sequence.findIndex((m) => m.kind === kind) >= 0;

  const add = (kind: Row["kind"]) => {
    if (inSeq(kind)) return;
    onChange({ callResponseSequence: [...sequence, { kind }] });
  };
  const remove = (kind: Row["kind"]) => {
    onChange({
      callResponseSequence: sequence.filter((m) => m.kind !== kind),
    });
  };
  const move = (kind: Row["kind"], dir: -1 | 1) => {
    const idx = sequence.findIndex((m) => m.kind === kind);
    if (idx < 0) return;
    const next = [...sequence];
    const j = idx + dir;
    if (j < 0 || j >= next.length) return;
    const [m] = next.splice(idx, 1);
    next.splice(j, 0, m);
    onChange({ callResponseSequence: next });
  };

  return (
    <div className="rounded-lg border border-[#d2d2d2] bg-[#ebebeb] p-3">
      <div className="text-[11px] uppercase tracking-wide text-[#6b6b6b] mb-2">
        Call & Response (Pre-test)
      </div>

      <Field label="Available modes">
        <div className="grid grid-cols-1 gap-2">
          {ALL.map((row) => {
            const selected = inSeq(row.kind);
            return (
              <div
                key={row.id}
                className="flex items-center justify-between rounded-md border border-[#d2d2d2] bg-white/70 px-3 py-2"
              >
                <div className="text-sm">{row.label}</div>
                {!selected ? (
                  <button
                    type="button"
                    onClick={() => add(row.kind)}
                    className="px-2 py-1 text-sm rounded-md border border-[#d2d2d2] bg-[#f0f0f0] hover:bg-white"
                  >
                    Add
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => remove(row.kind)}
                    className="px-2 py-1 text-sm rounded-md border border-[#d2d2d2] bg-white hover:bg-[#f8f8f8]"
                  >
                    Remove
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </Field>

      <Field label="Order (top → bottom)">
        <div className="grid grid-cols-1 gap-2">
          {(sequence.length ? sequence : []).map((m, i) => {
            const row = ALL.find((r) => r.kind === m.kind)!;
            return (
              <div
                key={`${row.id}-${i}`}
                className="flex items-center justify-between rounded-md border border-[#d2d2d2] bg-white/70 px-3 py-2"
              >
                <div className="text-sm">{row.label}</div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => move(row.kind, -1)}
                    disabled={i === 0}
                    className="px-2 py-1 text-sm rounded-md border border-[#d2d2d2] bg-[#f0f0f0] disabled:opacity-40"
                    title="Move up"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    onClick={() => move(row.kind, +1)}
                    disabled={i === sequence.length - 1}
                    className="px-2 py-1 text-sm rounded-md border border-[#d2d2d2] bg-[#f0f0f0] disabled:opacity-40"
                    title="Move down"
                  >
                    ↓
                  </button>
                </div>
              </div>
            );
          })}
          {sequence.length === 0 ? (
            <div className="text-sm text-[#6b6b6b]">
              No modes selected. Pre-test will be skipped.
            </div>
          ) : null}
        </div>
      </Field>
    </div>
  );
}
