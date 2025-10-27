// hooks/students/useStudentGestureLatencyUpdater.ts
"use client";
import { useEffect, useRef, useCallback } from "react";

/** Updates the current user's latest model row (server does the id lookup). */
export default function useStudentGestureLatencyUpdater(studentRowId: string | null) {
  const idRef = useRef<string | null>(studentRowId);
  useEffect(() => { idRef.current = studentRowId; }, [studentRowId]);

  const updateGestureLatency = useCallback(async (latencyMs: number) => {
    try {
      const res = await fetch("/api/students/current/gesture-latency", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ latency_ms: Math.round(latencyMs) }),
        credentials: "include",
        keepalive: true,
      });

      if (res.ok) {
        try {
          window.dispatchEvent(new CustomEvent("student-gesture-latency-updated", {
            detail: { latencyMs: Math.round(latencyMs), studentRowId: idRef.current },
          }));
        } catch {}
      } else {
        const err = await res.json().catch(() => ({}));
        // eslint-disable-next-line no-console
        console.warn(`[student gesture-latency] update failed:`, err?.error || `HTTP ${res.status}`);
      }
    } catch (e: any) {
      // eslint-disable-next-line no-console
      console.warn(`[student gesture-latency] update failed:`, e?.message || String(e));
    }
  }, []);

  return updateGestureLatency;
}
