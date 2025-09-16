// hooks/training/useTrainingModelRow.ts
"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type ModelRow = {
  id: string;
  creator_display_name: string;
  gender: "male" | "female" | "unspecified" | "other";
};

type ReturnShape = {
  modelRowId: string | null;
  subjectId: string | null;
  genderLabel: "male" | "female" | null;
  loading: boolean;
  error: string | null;
};

export default function useTrainingModelRow(opts: { modelIdFromQuery: string | null }): ReturnShape {
  const { modelIdFromQuery } = opts;

  const supabase = useMemo(() => createClient(), []);
  const [modelRowId, setModelRowId] = useState<string | null>(null);
  const [subjectId, setSubjectId] = useState<string | null>(null);
  const [genderLabel, setGenderLabel] = useState<"male" | "female" | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      setErr(null);
      try {
        const { data: userRes, error: userErr } = await supabase.auth.getUser();
        if (userErr) throw userErr;
        const user = userRes.user;
        if (!user) {
          if (!alive) return;
          setModelRowId(null);
          setSubjectId(null);
          setGenderLabel(null);
          setLoading(false);
          return;
        }

        let row: ModelRow | null = null;

        if (modelIdFromQuery) {
          const { data, error } = await supabase
            .from("models")
            .select("id, creator_display_name, gender")
            .eq("id", modelIdFromQuery)
            .single();
          if (error) throw error;
          row = data as ModelRow;
        } else {
          const { data, error } = await supabase
            .from("models")
            .select("id, creator_display_name, gender")
            .eq("uid", user.id)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          if (error) throw error;
          row = (data ?? null) as ModelRow | null;
        }

        if (!alive) return;

        if (row) {
          setModelRowId(row.id);
          setSubjectId(row.creator_display_name || null);
          setGenderLabel(row.gender === "male" || row.gender === "female" ? row.gender : null);
        } else {
          setModelRowId(null);
          setSubjectId(null);
          setGenderLabel(null);
        }
      } catch (e: any) {
        if (!alive) return;
        setModelRowId(null);
        setSubjectId(null);
        setGenderLabel(null);
        setErr(e?.message || String(e));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [modelIdFromQuery, supabase]);

  return { modelRowId, subjectId, genderLabel, loading, error: err };
}
