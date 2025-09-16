// hooks/training/useRangeUpdater.ts
"use client";

import { useEffect, useMemo, useRef, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * Stable updater for model range labels that always reads the latest modelRowId.
 * - No dependency churn for consumers (stable function identity).
 * - Safe against stale closures via an internal ref.
 */
export default function useRangeUpdater(modelRowId: string | null) {
  const supabase = useMemo(() => createClient(), []);

  // Track the latest model id without changing the callback’s identity.
  const idRef = useRef<string | null>(modelRowId);
  useEffect(() => {
    idRef.current = modelRowId;
  }, [modelRowId]);

  const updateRange = useCallback(
    async (which: "low" | "high", noteLabel: string) => {
      const id = idRef.current;
      if (!id) return;

      try {
        const payload = which === "low" ? { range_low: noteLabel } : { range_high: noteLabel };
        const { error } = await supabase.from("models").update(payload).eq("id", id);
        if (error) {
          // eslint-disable-next-line no-console
          console.warn(`[training] Failed to update ${which} range:`, error.message || error);
        }
      } catch (e: any) {
        // eslint-disable-next-line no-console
        console.warn(`[training] Failed to update ${which} range:`, e?.message || String(e));
      }
    },
    [supabase]
  );

  return updateRange;
}
