// components/history/StudentHistory.tsx
'use client';

import * as React from 'react';
import { createClient } from '@/lib/supabase/client';
import { COURSES } from '@/lib/courses/registry';
import ResultDetails from './ResultDetails';
import ResultsList, { type ResultRow } from './ResultsList';
import HeaderSummary from './HeaderSummary';

type DbRow = {
  id: string;
  created_at: string;
  course_slug: string;
  lesson_slug: string;
  final_percent: string | number | null;
  pitch_percent: string | number | null;
  pitch_time_on_ratio: string | number | null;
  pitch_cents_mae: string | number | null;
  rhythm_melody_percent: string | number | null;
  rhythm_line_percent: string | number | null;
  intervals_correct_ratio: string | number | null;
};

const titleByLessonSlug: Record<string, string> = (() => {
  const m: Record<string, string> = {};
  for (const c of COURSES) for (const l of c.lessons) m[l.slug] = l.title;
  return m;
})();

// Pretty course titles by slug
const courseTitleBySlug: Record<string, string> = (() => {
  const m: Record<string, string> = {};
  for (const c of COURSES) m[c.slug] = c.title;
  return m;
})();

function safeNum(x: unknown): number | null {
  if (x == null) return null;
  const n = typeof x === 'number' ? x : Number(x);
  return Number.isFinite(n) ? n : null;
}

export default function StudentHistory({
  onHeaderMetaChange,
}: {
  /** Emits the selected lesson's Title + Course title + YYYY-MM-DD date for the top header's right 3-row slot. */
  onHeaderMetaChange?: (meta: { title: string; courseTitle: string; date: string } | null) => void;
}) {
  const [rows, setRows] = React.useState<ResultRow[]>([]);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const [courseFilter, setCourseFilter] = React.useState<string | 'all'>('all');

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
          setError(e?.message ?? 'Failed to load history');
          setRows([]);
          setSelectedId(null);
        }
      } finally {
        if (!cancel) setLoading(false);
      }
    })();
    return () => { cancel = true; };
  }, []);

  const filteredRows = React.useMemo(
    () => rows.filter(r => courseFilter === 'all' ? true : r.course === courseFilter),
    [rows, courseFilter]
  );

  React.useEffect(() => {
    if (!filteredRows.length) { setSelectedId(null); return; }
    if (!selectedId || !filteredRows.some(r => r.id === selectedId)) {
      setSelectedId(filteredRows[0].id);
    }
  }, [courseFilter, filteredRows, selectedId]);

  const selected = filteredRows.find(r => r.id === selectedId) ?? null;

  // Emit title + course + date to the header (3-row block)
  React.useEffect(() => {
    if (!onHeaderMetaChange) return;
    if (!selected) { onHeaderMetaChange(null); return; }
    const title = selected.title;
    const courseTitle = courseTitleBySlug[selected.course] ?? selected.course;
    const date = selected.when.toISOString().slice(0, 10);
    onHeaderMetaChange({ title, courseTitle, date });
  }, [selected, onHeaderMetaChange]);

  const courseOptions = React.useMemo(
    () => COURSES.map(c => ({ slug: c.slug, title: c.title })),
    []
  );

  return (
    <section className="w-full h-full">
      <div className="h-full grid grid-cols-1 md:grid-cols-8 gap-3 isolate pb-2">
        {/* LEFT: Details (6/8) — header text moved to top header; keep metrics here */}
        <div className="md:col-span-6 min-h-0">
          {selected ? (
            <div className="mt-0">
              <HeaderSummary
                finalPct={selected.final}
                pitchPct={selected.pitch}
                timeOnPitchPct={selected.pitchTimeOn ?? null}
                pitchMae={selected.pitchMae ?? null}
                melodyPct={selected.melody}
                linePct={selected.line}
                intervalsPct={selected.intervals}
              />
            </div>
          ) : (
            <div className="text-sm text-[#6b6b6b]">
              Select a lesson from the right to see details.
            </div>
          )}

          <div className="mt-3">
            {selected ? (
              <ResultDetails
                resultId={selected.id}
                pitchSummary={{ timeOnPct: selected.pitchTimeOn ?? null, maeCents: selected.pitchMae ?? null }}
              />
            ) : null}
            {error ? <div className="mt-2 text-sm text-[#dc2626]">{error}</div> : null}
          </div>
        </div>

        {/* RIGHT: Recent Results (2/8) — table is its own card inside ResultsList */}
        <div className="md:col-span-2 min-h-0">
          {loading ? (
            <div
              className="rounded-2xl border border-[#d2d2d2] bg-[#eaeaea] p-6 shadow-sm space-y-2 h-full"
              aria-hidden
            >
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="h-10 rounded bg-[#e8e8e8] animate-pulse" />
              ))}
            </div>
          ) : (
            <ResultsList
              rows={filteredRows}
              selectedId={selectedId}
              onSelect={setSelectedId}
              className="h-full"
              courseFilter={courseFilter}
              onCourseChange={setCourseFilter}
              courseOptions={courseOptions}
            />
          )}
        </div>
      </div>
    </section>
  );
}
