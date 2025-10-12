// hooks/students/useStudentRow.ts
"use client";

import { useEffect, useState } from "react";

type StudentRow = {
  id: string;
  creator_display_name: string;
  // gender removed from DB
  range_low?: string | null;
  range_high?: string | null;
};

type ReturnShape = {
  studentRowId: string | null;
  studentName: string | null;
  genderLabel: "male" | "female" | null; // keep in API for UI compatibility, always null now
  rangeLowLabel: string | null;
  rangeHighLabel: string | null;
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
  const [genderLabel, setGenderLabel] = useState<"male" | "female" | null>(null);
  const [rangeLowLabel, setRangeLowLabel] = useState<string | null>(null);
  const [rangeHighLabel, setRangeHighLabel] = useState<string | null>(null);
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
    window.addEventListener("student-range-updated", onRangeUpdated as EventListener);
    return () => window.removeEventListener("student-range-updated", onRangeUpdated as EventListener);
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
          // gender removed: always null
          setGenderLabel(null);
          setRangeLowLabel(row.range_low ?? null);
          setRangeHighLabel(row.range_high ?? null);
        } else {
          setStudentRowId(null);
          setStudentName(null);
          setGenderLabel(null);
          setRangeLowLabel(null);
          setRangeHighLabel(null);
        }
      } catch (e: any) {
        if (!alive || ac.signal.aborted) return;
        setErr(e?.message || String(e));
        setStudentRowId(null);
        setStudentName(null);
        setGenderLabel(null);
        setRangeLowLabel(null);
        setRangeHighLabel(null);
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
    genderLabel,
    rangeLowLabel,
    rangeHighLabel,
    loading,
    error: err,
  };
}
