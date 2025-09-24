// hooks/students/useStudentRange.ts
"use client";

import { useEffect, useMemo, useState } from "react";

function labelToHz(label: string, a4Hz = 440): number | null {
  const m = String(label || "").trim().match(/^([A-Ga-g])([#b]?)(-?\d+)$/);
  if (!m) return null;
  const base: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  const note = m[1].toUpperCase();
  let pc = base[note];
  if (pc == null) return null;
  if (m[2] === "#") pc += 1;
  if (m[2] === "b") pc -= 1;
  pc = ((pc % 12) + 12) % 12;
  const midi = 12 * (Number(m[3]) + 1) + pc;
  const hz = a4Hz * Math.pow(2, (midi - 69) / 12);
  return Number.isFinite(hz) ? hz : null;
}

type Result = { lowHz: number | null; highHz: number | null; loading: boolean; error: string | null };

type Opts = {
  /** If you already have labels from useStudentRow, pass them to suppress an extra fetch */
  rangeLowLabel?: string | null;
  rangeHighLabel?: string | null;
};

export default function useStudentRange(studentRowId: string | null, opts?: Opts): Result {
  const [lowHz, setLowHz] = useState<number | null>(null);
  const [highHz, setHighHz] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const haveBothLabels = useMemo(
    () => (opts?.rangeLowLabel ?? null) !== null && (opts?.rangeHighLabel ?? null) !== null,
    [opts?.rangeLowLabel, opts?.rangeHighLabel]
  );

  useEffect(() => {
    const ac = new AbortController();
    let alive = true;

    // Fast-path: if caller provided both labels, just compute locally.
    if (haveBothLabels) {
      setErr(null);
      setLoading(false);
      setLowHz(labelToHz(opts!.rangeLowLabel as string) ?? null);
      setHighHz(labelToHz(opts!.rangeHighLabel as string) ?? null);
      return () => {
        alive = false;
        ac.abort();
      };
    }

    (async () => {
      setLoading(true);
      setErr(null);
      try {
        const url = studentRowId
          ? `/api/students/${encodeURIComponent(studentRowId)}`
          : `/api/students/current/range`;

        const res = await fetch(url, {
          method: "GET",
          credentials: "include",
          signal: ac.signal,
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();

        const range_low: string | null = json?.range_low ?? null;
        const range_high: string | null = json?.range_high ?? null;

        if (!alive) return;
        setLowHz(range_low ? labelToHz(range_low) : null);
        setHighHz(range_high ? labelToHz(range_high) : null);
      } catch (e: any) {
        if (!alive || ac.signal.aborted) return;
        setErr(e?.message || String(e));
        setLowHz(null);
        setHighHz(null);
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
      ac.abort();
    };
  }, [studentRowId, haveBothLabels, opts?.rangeLowLabel, opts?.rangeHighLabel]);

  return { lowHz, highHz, loading, error: err };
}
