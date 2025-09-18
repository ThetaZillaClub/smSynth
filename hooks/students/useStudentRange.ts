// hooks/students/useStudentRange.ts
"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * Very small parser for labels like "C4", "C#4", "Db3", "A4".
 * Uses A4=440 and returns Hz. If unknown/invalid, returns null.
 */
function labelToHz(label: string, a4Hz = 440): number | null {
  if (!label) return null;
  const m = String(label).trim().match(/^([A-Ga-g])([#b]?)(-?\d+)$/);
  if (!m) return null;

  const note = m[1].toUpperCase();
  const acc = m[2] || "";
  const oct = Number(m[3]);
  if (!Number.isFinite(oct)) return null;

  // semitones from C
  const base: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  let pc = base[note];
  if (pc == null) return null;
  if (acc === "#") pc += 1;
  if (acc === "b") pc -= 1;
  pc = ((pc % 12) + 12) % 12;

  // MIDI: C4 = 60, A4 = 69
  const midi = 12 * (oct + 1) + pc;
  const hz = a4Hz * Math.pow(2, (midi - 69) / 12);
  return Number.isFinite(hz) ? hz : null;
}

type Result = {
  lowHz: number | null;
  highHz: number | null;
  loading: boolean;
  error: string | null;
};

/**
 * Reads range_low / range_high for a student model row from Supabase (public.models).
 * Returns converted Hz (A4=440) or nulls if missing.
 */
export default function useStudentRange(studentRowId: string | null): Result {
  const supabase = useMemo(() => createClient(), []);
  const [lowHz, setLowHz] = useState<number | null>(null);
  const [highHz, setHighHz] = useState<number | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      setErr(null);
      try {
        if (!studentRowId) {
          if (alive) {
            setLowHz(null);
            setHighHz(null);
          }
          return;
        }

        const { data, error } = await supabase
          .from("models")
          .select("range_low, range_high")
          .eq("id", studentRowId)
          .single();

        if (error) throw error;

        const low = data?.range_low ? labelToHz(data.range_low) : null;
        const high = data?.range_high ? labelToHz(data.range_high) : null;

        if (!alive) return;
        setLowHz(low ?? null);
        setHighHz(high ?? null);
      } catch (e: any) {
        if (!alive) return;
        setErr(e?.message || String(e));
        setLowHz(null);
        setHighHz(null);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [studentRowId, supabase]);

  return { lowHz, highHz, loading, error: err };
}
