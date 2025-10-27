// hooks/students/useStudentRow.ts
"use client";

import { useEffect, useState } from "react";

type StudentRow = {
  id: string;
  creator_display_name: string;
  range_low?: string | null;
  range_high?: string | null;
  gesture_latency_ms?: number | null;
};

type ReturnShape = {
  studentRowId: string | null;
  studentName: string | null;
  rangeLowLabel: string | null;
  rangeHighLabel: string | null;
  gestureLatencyMs: number | null;
  loading: boolean;
  error: string | null;
};

export default function useStudentRow({
  studentIdFromQuery,
}: {
  studentIdFromQuery: string | null;
}): ReturnShape {
  const [studentRowId, setStudentRowId] = useState<string | null>(null);
  const [studentName, setStudentName] = useState<string | null>(null);
  const [rangeLowLabel, setRangeLowLabel] = useState<string | null>(null);
  const [rangeHighLabel, setRangeHighLabel] = useState<string | null>(null);
  const [gestureLatencyMs, setGestureLatencyMs] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  // Update labels immediately on local range saves, without refetching the row
  useEffect(() => {
    const onRangeUpdated = (evt: Event) => {
      const e = evt as CustomEvent<{ which: "low" | "high"; label: string; studentRowId: string | null }>;
      // If the event targets a specific row and it's not ours, ignore.
      if (e.detail?.studentRowId && studentRowId && e.detail.studentRowId !== studentRowId) return;
      if (e.detail?.which === "low") setRangeLowLabel(e.detail.label ?? null);
      if (e.detail?.which === "high") setRangeHighLabel(e.detail.label ?? null);
    };

    const onLatencyUpdated = (evt: Event) => {
      const e = evt as CustomEvent<{ latencyMs: number; studentRowId: string | null }>;
      if (e.detail?.studentRowId && studentRowId && e.detail.studentRowId !== studentRowId) return;
      const n = e.detail?.latencyMs;
      setGestureLatencyMs(Number.isFinite(n as number) ? (n as number) : null);
    };    
    window.addEventListener("student-range-updated", onRangeUpdated as EventListener);
    window.addEventListener("student-gesture-latency-updated", onLatencyUpdated as EventListener);
    return () => window.removeEventListener("student-range-updated", onRangeUpdated as EventListener);
    window.removeEventListener("student-gesture-latency-updated", onLatencyUpdated as EventListener);
  }, [studentRowId]);

  // Initial fetch (and when the target student changes)
  useEffect(() => {
    const ac = new AbortController();
    let alive = true;

    (async () => {
      setLoading(true);
      setErr(null);
      try {
        const url = studentIdFromQuery
          ? `/api/students/${encodeURIComponent(studentIdFromQuery)}`
          : `/api/students/current`;

        const res = await fetch(url, {
          method: "GET",
          credentials: "include",
          signal: ac.signal,
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const row: StudentRow | null = await res.json();

        if (!alive) return;
        if (row) {
          setStudentRowId(row.id);
          setStudentName(row.creator_display_name || null);
          setRangeLowLabel(row.range_low ?? null);
          setRangeHighLabel(row.range_high ?? null);
          setGestureLatencyMs(
            typeof row.gesture_latency_ms === "number" ? row.gesture_latency_ms : null
          );          
        } else {
          setStudentRowId(null);
          setStudentName(null);
          setRangeLowLabel(null);
          setRangeHighLabel(null);
          setGestureLatencyMs(null);
        }
      } catch (e: any) {
        if (!alive || ac.signal.aborted) return;
        setErr(e?.message || String(e));
        setStudentRowId(null);
        setStudentName(null);
        setRangeLowLabel(null);
        setRangeHighLabel(null);
        setGestureLatencyMs(null);
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
      ac.abort();
    };
  }, [studentIdFromQuery]);

  return {
    studentRowId,
    studentName,
    rangeLowLabel,
    rangeHighLabel,
    gestureLatencyMs,
    loading,
    error: err,
  };
}
