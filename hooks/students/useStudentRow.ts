// hooks/students/useStudentRow.ts
"use client";

import { useEffect, useState } from "react";

type StudentRow = {
  id: string;
  creator_display_name: string;
  gender: "male" | "female" | "unspecified" | "other";
  range_low?: string | null;
  range_high?: string | null;
};

type ReturnShape = {
  studentRowId: string | null;
  studentName: string | null;
  genderLabel: "male" | "female" | null;
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

  // bump this whenever we hear “student-range-updated”
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    const onRangeUpdated = () => setRefreshTick((t) => t + 1);
    window.addEventListener("student-range-updated", onRangeUpdated as EventListener);
    return () => window.removeEventListener("student-range-updated", onRangeUpdated as EventListener);
  }, []);

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
          cache: "no-cache",      // 👈 avoid cached row
          signal: ac.signal,
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const row: StudentRow | null = await res.json();

        if (!alive) return;
        if (row) {
          setStudentRowId(row.id);
          setStudentName(row.creator_display_name || null);
          setGenderLabel(row.gender === "male" || row.gender === "female" ? row.gender : null);
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
  }, [studentIdFromQuery, refreshTick]); // 👈 refetch when the event bumps tick

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
