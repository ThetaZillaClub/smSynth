// components/home/data/HomeResultsProvider.tsx
'use client';

import * as React from 'react';
import { createClient } from '@/lib/supabase/client';
import { ensureSessionReady } from '@/lib/client-cache';
import { useHomeBootstrap } from '@/components/home/HomeBootstrap';

export type HomeResultsCtx = {
  rows: Array<{
    id: string;
    created_at: string;
    lesson_slug: string;
    final_percent: number;
    pitch_percent: number | null;
    rhythm_melody_percent: number | null;
    rhythm_line_percent: number | null;
    intervals_correct_ratio: number | null;
  }>;
  recentIds: string[];
  loading: boolean;
  error: string | null;
};

const Ctx = React.createContext<HomeResultsCtx | null>(null);

export function HomeResultsProvider({ children }: { children: React.ReactNode }) {
  const supabase = React.useMemo(() => createClient(), []);
  const { uid } = useHomeBootstrap();
  const [state, setState] = React.useState<HomeResultsCtx>({
    rows: [],
    recentIds: [],
    loading: true,
    error: null,
  });

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setState(s => ({ ...s, loading: true, error: null }));
        await ensureSessionReady(supabase, 2000);

        const { data, error } = await supabase
          .from('lesson_results')
          .select('id, created_at, lesson_slug, final_percent, pitch_percent, rhythm_melody_percent, rhythm_line_percent, intervals_correct_ratio')
          .eq('uid', uid)
          .order('created_at', { ascending: true })
          .limit(400);

        if (error) throw error;

        type Row = HomeResultsCtx['rows'][number];
        const rows: Row[] = (data ?? []) as Row[];
        const recentIds = rows.slice(-30).map(r => r.id);

        if (!cancelled) {
          setState({ rows, recentIds, loading: false, error: null });
        }
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e);
        if (!cancelled) setState(s => ({ ...s, loading: false, error: message }));
      }
    })();
    return () => { cancelled = true; };
  }, [supabase, uid]);

  return <Ctx.Provider value={state}>{children}</Ctx.Provider>;
}

export function useHomeResults(): HomeResultsCtx {
  const ctx = React.useContext(Ctx);
  if (!ctx) throw new Error('useHomeResults must be used within HomeResultsProvider');
  return ctx;
}
