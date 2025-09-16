// hooks/students/useStudentRow.ts
"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

// We still read from the "models" table for now.
// Naming here is student-first; backend renaming comes later.
type StudentRow = {
  id: string;
  creator_display_name: string;
  gender: "male" | "female" | "unspecified" | "other";
};

type ReturnShape = {
  studentRowId: string | null;
  studentName: string | null;
  genderLabel: "male" | "female" | null;
  loading: boolean;
  error: string | null;
};

export default function useStudentRow(opts: {
  /** Still coming from ?model_id for now (backend change later) */
  studentIdFromQuery: string | null;
}): ReturnShape {
  const { studentIdFromQuery } = opts;

  const supabase = useMemo(() => createClient(), []);
  const [studentRowId, setStudentRowId] = useState<string | null>(null);
  const [studentName, setStudentName] = useState<string | null>(null);
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
          setStudentRowId(null);
          setStudentName(null);
          setGenderLabel(null);
          setLoading(false);
          return;
        }

        let row: StudentRow | null = null;

        if (studentIdFromQuery) {
          // NOTE: still selecting from "models" table
          const { data, error } = await supabase
            .from("models")
            .select("id, creator_display_name, gender")
            .eq("id", studentIdFromQuery)
            .single();
          if (error) throw error;
          row = data as StudentRow;
        } else {
          const { data, error } = await supabase
            .from("models")
            .select("id, creator_display_name, gender")
            .eq("uid", user.id)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          if (error) throw error;
          row = (data ?? null) as StudentRow | null;
        }

        if (!alive) return;

        if (row) {
          setStudentRowId(row.id);
          setStudentName(row.creator_display_name || null);
          setGenderLabel(row.gender === "male" || row.gender === "female" ? row.gender : null);
        } else {
          setStudentRowId(null);
          setStudentName(null);
          setGenderLabel(null);
        }
      } catch (e: any) {
        if (!alive) return;
        setStudentRowId(null);
        setStudentName(null);
        setGenderLabel(null);
        setErr(e?.message || String(e));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [studentIdFromQuery, supabase]);

  return { studentRowId, studentName, genderLabel, loading, error: err };
}
