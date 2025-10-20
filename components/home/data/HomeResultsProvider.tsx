// components/home/data/HomeResultsProvider.tsx
'use client';

import * as React from 'react';
import { createClient } from '@/lib/supabase/client';
import { ensureSessionReady } from '@/lib/client-cache';
import { useHomeBootstrap } from '@/components/home/HomeBootstrap';
import { COURSES } from '@/lib/courses/registry';

export type HomeResultsCtx = {
  rows: Array<{
    id: string;
    created_at: string;
    lesson_key: string;             // normalized identity (prefer "course/lesson")
    lesson_slug: string;            // raw from DB (may be plain or namespaced)
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

// Build lesson_slug -> set(courses) to detect uniqueness for legacy rows
const LESSON_TO_COURSES: Map<string, Set<string>> = (() => {
  const m = new Map<string, Set<string>>();
  for (const c of COURSES) {
    for (const l of c.lessons) {
      const set = m.get(l.slug) ?? new Set<string>();
      set.add(c.slug);
      m.set(l.slug, set);
    }
  }
  return m;
})();

const isNamespaced = (s: string) => s.includes('/');

function normalizeKey(rawSlug: string): string {
  if (!rawSlug) return '';
  if (isNamespaced(rawSlug)) return rawSlug; // already "course/lesson"
  // legacy plain slug: only namespace if it belongs to exactly one course
  const courses = LESSON_TO_COURSES.get(rawSlug);
  if (courses && courses.size === 1) {
    // return the only course
    for (const course of courses) return `${course}/${rawSlug}`;
  }
  // ambiguous: keep plain (prevents accidental cross-credit)
  return rawSlug;
}

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
        setState((s) => ({ ...s, loading: true, error: null }));
        await ensureSessionReady(supabase, 2000);

        const { data, error } = await supabase
          .from('lesson_results')
          .select(
            'id, created_at, lesson_slug, final_percent, pitch_percent, rhythm_melody_percent, rhythm_line_percent, intervals_correct_ratio'
          )
          .eq('uid', uid)
          .order('created_at', { ascending: false }) // newest first
          .limit(400);

        if (error) throw error;

        type RawRow = {
          id: string;
          created_at: string;
          lesson_slug: string | null;
          final_percent: number;
          pitch_percent: number | null;
          rhythm_melody_percent: number | null;
          rhythm_line_percent: number | null;
          intervals_correct_ratio: number | null;
        };

        const newestFirst: RawRow[] = (data ?? []) as RawRow[];

        // Normalize identity for downstream consumers (Home cards, PitchFocusCard, etc.)
        const normalized = newestFirst.map((r) => {
          const slug = String(r.lesson_slug ?? '');
          const key = normalizeKey(slug);
          return {
            id: r.id,
            created_at: r.created_at,
            lesson_key: key,
            lesson_slug: slug,
            final_percent: r.final_percent,
            pitch_percent: r.pitch_percent,
            rhythm_melody_percent: r.rhythm_melody_percent,
            rhythm_line_percent: r.rhythm_line_percent,
            intervals_correct_ratio: r.intervals_correct_ratio,
          };
        });

        // Keep chronology ascending for any UI that expects it
        const rows = [...normalized].reverse();

        // Latest N ids for downstream consumers
        const recentIds = normalized.slice(0, 30).map((r) => r.id);

        if (!cancelled) setState({ rows, recentIds, loading: false, error: null });
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e);
        if (!cancelled) setState((s) => ({ ...s, loading: false, error: message }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase, uid]);

  return <Ctx.Provider value={state}>{children}</Ctx.Provider>;
}

export function useHomeResults(): HomeResultsCtx {
  const ctx = React.useContext(Ctx);
  if (!ctx) throw new Error('useHomeResults must be used within HomeResultsProvider');
  return ctx;
}
