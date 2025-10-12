// hooks/progress/useLessonBests.ts
'use client';

import * as React from 'react';
import { createClient } from '@/lib/supabase/client';
import { ensureSessionReady } from '@/lib/client-cache';

export type LessonBests = Record<string, number>; // lesson_slug -> best final_percent

export default function useLessonBests() {
  const supabase = React.useMemo(() => createClient(), []);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [bests, setBests] = React.useState<LessonBests>({});

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true); setError(null);
        await ensureSessionReady(supabase, 2000);
        const { data: u } = await supabase.auth.getUser();
        const uid = u.user?.id;
        if (!uid) { if (!cancelled) setBests({}); return; }

        const { data, error } = await supabase
          .from('lesson_bests')
          .select('lesson_slug, final_percent')
          .eq('uid', uid);

        if (error) throw error;

        const map: LessonBests = {};
        for (const row of data ?? []) {
          const slug = (row as any).lesson_slug as string | undefined;
          const pct = Number((row as any).final_percent ?? 0);
          if (slug) map[slug] = pct;
        }
        if (!cancelled) setBests(map);
      } catch (e: any) {
        if (!cancelled) setError(e?.message || String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [supabase]);

  return { loading, error, bests };
}
