// components/stats/StudentStats.tsx
'use client';

import * as React from 'react';
import { createClient } from '@/lib/supabase/client';
import { COURSES } from '@/lib/courses/registry';
import ResultDetails from './ResultDetails';
import ResultsList, { type ResultRow } from './ResultsList';

type DbRow = {
  id: string;
  created_at: string;
  course_slug: string;
  lesson_slug: string;
  final_percent: string | number | null;
  pitch_percent: string | number | null;
  pitch_time_on_ratio: string | number | null;  // 0..1
  pitch_cents_mae: string | number | null;      // cents
  rhythm_melody_percent: string | number | null;
  rhythm_line_percent: string | number | null;
  intervals_correct_ratio: string | number | null; // 0..1
};

const titleByLessonSlug: Record<string, string> = (() => {
  const m: Record<string, string> = {};
  for (const c of COURSES) for (const l of c.lessons) m[l.slug] = l.title;
  return m;
})();

function safeNum(x: unknown): number | null {
  if (x == null) return null;
  const n = typeof x === 'number' ? x : Number(x);
  return Number.isFinite(n) ? n : null;
}

export default function StudentStats() {
  const [rows, setRows] = React.useState<ResultRow[]>([]);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        const supabase = createClient();
        const { data: { user }, error: uerr } = await supabase.auth.getUser();
        if (uerr) throw uerr;
        if (!user) { setRows([]); setSelectedId(null); setLoading(false); return; }

        const { data, error } = await supabase
          .from('lesson_results')
          .select(`
            id, created_at, course_slug, lesson_slug,
            final_percent,
            pitch_percent, pitch_time_on_ratio, pitch_cents_mae,
            rhythm_melody_percent, rhythm_line_percent,
            intervals_correct_ratio
          `)
          .eq('uid', user.id)
          .order('created_at', { ascending: false })
          .limit(200);

        if (error) throw error;

        const mapped: ResultRow[] = (data as DbRow[]).map((r) => {
          const title = titleByLessonSlug[r.lesson_slug] ?? r.lesson_slug ?? 'Unknown Lesson';
          const final = safeNum(r.final_percent);
          const pitch = safeNum(r.pitch_percent);
          const melody = safeNum(r.rhythm_melody_percent);
          const line = safeNum(r.rhythm_line_percent);
          const intervalsRatio = safeNum(r.intervals_correct_ratio);
          const timeOn = safeNum(r.pitch_time_on_ratio);
          const mae = safeNum(r.pitch_cents_mae);

          return {
            id: r.id,
            when: new Date(r.created_at),
            course: r.course_slug,
            title,
            final: final == null ? null : Math.round(Math.max(0, Math.min(100, final))),
            pitch: pitch == null ? null : Math.round(pitch),
            melody: melody == null ? null : Math.round(melody),
            line: line == null ? null : Math.round(line),
            intervals: intervalsRatio == null ? null : Math.round(Math.max(0, Math.min(1, intervalsRatio)) * 100),
            pitchTimeOn: timeOn == null ? null : Math.round(Math.max(0, Math.min(1, timeOn)) * 100),
            pitchMae: mae == null ? null : Math.round(mae),
          };
        });

        if (cancel) return;
        setRows(mapped);
        setSelectedId(mapped[0]?.id ?? null);
      } catch (e: any) {
        if (!cancel) {
          setError(e?.message ?? 'Failed to load stats');
          setRows([]);
          setSelectedId(null);
        }
      } finally {
        if (!cancel) setLoading(false);
      }
    })();
    return () => { cancel = true; };
  }, []);

  const selected = React.useMemo(() => rows.find(r => r.id === selectedId) ?? null, [rows, selectedId]);

  return (
    <section className="w-full h-full">
      {/* Full-width row like GameStage; pb-2 gives room for bottom shadows */}
      <div className="w-full h-full flex gap-3 isolate pb-2">
        {/* STAGE (left) */}
        <div className="flex-1 min-w-0 min-h-0 rounded-xl shadow-md relative z-0">
          <div className="w-full h-full rounded-xl bg-transparent border border-[#dcdcdc] p-3 md:p-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xl font-semibold">Details</h3>
              {selected ? (
                <div className="text-xs text-[#0f0f0f]/70">
                  {selected.when.toISOString().slice(0,10)} • {selected.course} • {selected.title}
                </div>
              ) : null}
            </div>

            {!selected ? (
              <div className="text-sm text-[#6b6b6b]">Select a lesson from the right to see details.</div>
            ) : (
              <ResultDetails
                resultId={selected.id}
                pitchSummary={{ timeOnPct: selected.pitchTimeOn ?? null, maeCents: selected.pitchMae ?? null }}
              />
            )}

            {error ? <div className="mt-2 text-sm text-[#dc2626]">{error}</div> : null}
          </div>
        </div>

        {/* SIDEPANEL (right) */}
        <aside className="shrink-0 w-[clamp(260px,20vw,380px)] h-full rounded-xl shadow-md relative z-10 pointer-events-auto">
          <div className="w-full h-full rounded-xl bg-transparent border border-[#dcdcdc] p-3 md:p-4">
            {loading ? (
              <div className="space-y-2">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="h-10 rounded bg-[#e8e8e8] animate-pulse" />
                ))}
              </div>
            ) : (
              <ResultsList
                rows={rows}
                selectedId={selectedId}
                onSelect={setSelectedId}
                className="h-full"
              />
            )}
          </div>
        </aside>
      </div>
    </section>
  );
}
