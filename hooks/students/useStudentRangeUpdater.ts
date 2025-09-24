// hooks/students/useStudentRangeUpdater.ts
"use client";
import { useRef, useEffect, useCallback } from "react";

/** Updates the current user's latest model row (server does the id lookup). */
export default function useStudentRangeUpdater(studentRowId: string | null) {
  const idRef = useRef<string | null>(studentRowId);
  useEffect(() => { idRef.current = studentRowId; }, [studentRowId]);

  const updateRange = useCallback(async (which: "low" | "high", noteLabel: string) => {
    try {
      const body = which === "low" ? { low: noteLabel } : { high: noteLabel };
      const res = await fetch("/api/students/current/range", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        credentials: "include",
        keepalive: true,
      });

      if (res.ok) {
        // 🔔 tell the app someone changed the range
        try {
          window.dispatchEvent(new CustomEvent("student-range-updated", {
            detail: { which, label: noteLabel, studentRowId: idRef.current },
          }));
        } catch {}
      } else {
        const err = await res.json().catch(() => ({}));
        // eslint-disable-next-line no-console
        console.warn(`[student range] update failed:`, err?.error || `HTTP ${res.status}`);
      }
    } catch (e: any) {
      // eslint-disable-next-line no-console
      console.warn(`[student range] update failed:`, e?.message || String(e));
    }
  }, []);

  return updateRange;
}
