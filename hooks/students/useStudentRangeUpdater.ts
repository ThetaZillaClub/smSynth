// hooks/students/useStudentRangeUpdater.ts
"use client";

import { useEffect, useMemo, useRef, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * Stable updater for student range labels that always reads the latest studentRowId.
 * (Still writes to the "models" table until backend rename.)
 */
export default function useStudentRangeUpdater(studentRowId: string | null) {
  const supabase = useMemo(() => createClient(), []);

  const idRef = useRef<string | null>(studentRowId);
  useEffect(() => {
    idRef.current = studentRowId;
  }, [studentRowId]);

  const updateRange = useCallback(
    async (which: "low" | "high", noteLabel: string) => {
      const id = idRef.current;
      if (!id) return;

      try {
        const payload = which === "low" ? { range_low: noteLabel } : { range_high: noteLabel };
        // NOTE: still updating "models" table
        const { error } = await supabase.from("models").update(payload).eq("id", id);
        if (error) {
          // eslint-disable-next-line no-console
          console.warn(`[student range] Failed to update ${which} range:`, error.message || error);
        }
      } catch (e: any) {
        // eslint-disable-next-line no-console
        console.warn(`[student range] Failed to update ${which} range:`, e?.message || String(e));
      }
    },
    [supabase]
  );

  return updateRange;
}
