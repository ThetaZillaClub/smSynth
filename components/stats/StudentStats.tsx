// components/stats/StudentStats.tsx
'use client';
import * as React from 'react';
import { createClient } from '@/lib/supabase/client';
import { COURSES } from '@/lib/courses/registry';
import HeaderSummary from './HeaderSummary';
import CombinedDetails from './CombinedDetails';

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
type PitchNoteRow = { result_id: string; midi: number; n: number; ratio: number; cents_mae: number };
type MelDurRow = { result_id: string; duration_label: string; attempts: number; hits: number | null; hit_pct: number | null; first_voice_mu_abs_ms: number | null };
type LineDurRow = { result_id: string; duration_label: string; attempts: number; successes: number; hit_pct: number; mu_abs_ms: number | null };
type IcRow = { result_id: string; semitones: number; attempts: number; correct: number };

const RECENCY_OPTS = [
  { key: '7d', label: 'Last 7 days', days: 7 },
  { key: '30d', label: 'Last 30 days', days: 30 },
  { key: '90d', label: 'Last 90 days', days: 90 },
  { key: '180d', label: 'Last 6 months', days: 180 },
  { key: '365d', label: 'Last 12 months', days: 365 },
  { key: 'all', label: 'All time', days: null as number | null },
] as const;
type RecencyKey = (typeof RECENCY_OPTS)[number]['key'];

function safeNum(x: unknown): number | null {
  if (x == null) return null;
  const n = typeof x === 'number' ? x : Number(x);
  return Number.isFinite(n) ? n : null;
}

export default function StudentStats() {
  const [allRows, setAllRows] = React.useState<DbRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  // filters
  const [recency, setRecency] = React.useState<RecencyKey>('90d');
  const [course, setCourse] = React.useState<string | 'all'>('all');
  const [lesson, setLesson] = React.useState<string | 'all'>('all');

  // aggregated detail state
  const [pitchNotes, setPitchNotes] = React.useState<Array<{ midi: number; n: number; ratio: number; cents_mae: number }>>([]);
  const [melodyDur, setMelodyDur] = React.useState<Array<{ duration_label: string; attempts: number; hits: number | null; hit_pct: number | null; first_voice_mu_abs_ms: number | null }>>([]);
  const [lineDur, setLineDur] = React.useState<Array<{ duration_label: string; attempts: number; successes: number; hit_pct: number; mu_abs_ms: number | null }>>([]);
  const [intervals, setIntervals] = React.useState<Array<{ semitones: number; attempts: number; correct: number }>>([]);

  const [detailsLoading, setDetailsLoading] = React.useState(false);
  const [detailsErr, setDetailsErr] = React.useState<string | null>(null);

  // header summary numbers
  const [finalPct, setFinalPct] = React.useState<number | null>(null);
  const [pitchPct, setPitchPct] = React.useState<number | null>(null);
  const [timeOnPitchPct, setTimeOnPitchPct] = React.useState<number | null>(null);
  const [pitchMae, setPitchMae] = React.useState<number | null>(null);
  const [melodyPct, setMelodyPct] = React.useState<number | null>(null);
  const [linePct, setLinePct] = React.useState<number | null>(null);
  const [intervalsPct, setIntervalsPct] = React.useState<number | null>(null);

  // load all results once
  React.useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        setLoading(true);
        const supabase = createClient();
        const { data: { user }, error: uerr } = await supabase.auth.getUser();
        if (uerr) throw uerr;
        if (!user) { setAllRows([]); return; }
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
          .limit(500);
        if (error) throw error;
        if (cancel) return;
        setAllRows((data ?? []) as DbRow[]);
      } catch (e: unknown) {
        if (!cancel) setError(e instanceof Error ? e.message : 'Failed to load stats');
      } finally {
        if (!cancel) setLoading(false);
      }
    })();
    return () => { cancel = true; };
  }, []);

  // compute filtered set of rows by recency/course/lesson
  const filtered = React.useMemo(() => {
    const now = Date.now();
    const days = RECENCY_OPTS.find(o => o.key === recency)?.days ?? null;
    const minTime = days == null ? null : now - days * 24 * 60 * 60 * 1000;
    return allRows.filter(r => {
      if (minTime != null && new Date(r.created_at).getTime() < minTime) return false;
      if (course !== 'all' && r.course_slug !== course) return false;
      if (lesson !== 'all' && r.lesson_slug !== lesson) return false;
      return true;
    });
  }, [allRows, recency, course, lesson]);

  // fetch + aggregate details whenever filtered result IDs change
  React.useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        setDetailsErr(null);
        setDetailsLoading(true);
        const ids = filtered.map(r => r.id);
        if (!ids.length) {
          setPitchNotes([]); setMelodyDur([]); setLineDur([]); setIntervals([]);
          // zero-out header metrics too
          setFinalPct(null); setPitchPct(null); setTimeOnPitchPct(null);
          setPitchMae(null); setMelodyPct(null); setLinePct(null); setIntervalsPct(null);
          return;
        }
        const supabase = createClient();
        const [pitchRes, melDurRes, lineDurRes, icRes] = await Promise.all([
          supabase.from('lesson_result_pitch_notes')
            .select('result_id,midi,n,ratio,cents_mae').in('result_id', ids),
          supabase.from('lesson_result_melody_durations')
            .select('result_id,duration_label,attempts,hits,hit_pct,first_voice_mu_abs_ms').in('result_id', ids),
          supabase.from('lesson_result_rhythm_durations')
            .select('result_id,duration_label,attempts,successes,hit_pct,mu_abs_ms').in('result_id', ids),
          supabase.from('lesson_result_interval_classes')
            .select('result_id,semitones,attempts,correct').in('result_id', ids),
        ]);
        if (pitchRes.error) throw new Error(pitchRes.error.message);
        if (melDurRes.error) throw new Error(melDurRes.error.message);
        if (lineDurRes.error) throw new Error(lineDurRes.error.message);
        if (icRes.error) throw new Error(icRes.error.message);

        // ---- Aggregate PITCH NOTES
        const pitchRows = (pitchRes.data ?? []) as PitchNoteRow[];
        const pmap = new Map<number, { n: number; ratio_w: number; mae_w: number }>();
        for (const r of pitchRows) {
          const cur = pmap.get(r.midi) ?? { n: 0, ratio_w: 0, mae_w: 0 };
          cur.n += r.n;
          cur.ratio_w += r.ratio * r.n;
          cur.mae_w += r.cents_mae * r.n;
          pmap.set(r.midi, cur);
        }
        const pitchAgg = Array.from(pmap.entries())
          .map(([midi, v]) => ({
            midi,
            n: v.n,
            ratio: v.n ? v.ratio_w / v.n : 0,
            cents_mae: v.n ? v.mae_w / v.n : 0,
          }))
          .sort((a, b) => b.n - a.n);

        // summary from pitch notes (preferred)
        const totalN = pitchAgg.reduce((a, r) => a + r.n, 0);
        const timeOnPct =
          totalN ? Math.round((pitchAgg.reduce((a, r) => a + r.ratio * r.n, 0) / totalN) * 100) : null;
        const maeCents =
          totalN ? Math.round(pitchAgg.reduce((a, r) => a + r.cents_mae * r.n, 0) / totalN) : null;

        // ---- Aggregate MELODY DURATIONS to Hit %
        const melRows = (melDurRes.data ?? []) as MelDurRow[];
        type MelAcc = { attempts: number; hits_approx: number; mu_w: number; mu_w_denom: number };
        const mmap = new Map<string, MelAcc>();
        for (const r of melRows) {
          const cur = mmap.get(r.duration_label) ?? { attempts: 0, hits_approx: 0, mu_w: 0, mu_w_denom: 0 };
          // attempts
          cur.attempts += r.attempts;
          // hits: prefer integer hits; else approximate from hit_pct * attempts
          const addHits =
            r.hits != null ? Number(r.hits) :
            r.hit_pct != null ? (Number(r.hit_pct) / 100) * r.attempts : 0;
          cur.hits_approx += addHits;
          // average offset (attempt-weighted when present)
          if (r.first_voice_mu_abs_ms != null) {
            cur.mu_w += Number(r.first_voice_mu_abs_ms) * r.attempts;
            cur.mu_w_denom += r.attempts;
          }
          mmap.set(r.duration_label, cur);
        }
        const melodyAgg = Array.from(mmap.entries()).map(([label, acc]) => ({
          duration_label: label,
          attempts: acc.attempts,
          hits: acc.attempts ? Math.round(acc.hits_approx) : null,
          hit_pct: acc.attempts ? (100 * acc.hits_approx) / acc.attempts : null,
          first_voice_mu_abs_ms: acc.mu_w_denom ? acc.mu_w / acc.mu_w_denom : null,
        })).sort((a, b) => b.attempts - a.attempts);

        // ---- Aggregate RHYTHM LINE DURATIONS
        const lineRows = (lineDurRes.data ?? []) as LineDurRow[];
        type LineAcc = { attempts: number; successes: number; mu_w: number; mu_w_denom: number };
        const lmap = new Map<string, LineAcc>();
        for (const r of lineRows) {
          const cur = lmap.get(r.duration_label) ?? { attempts: 0, successes: 0, mu_w: 0, mu_w_denom: 0 };
          cur.attempts += r.attempts;
          cur.successes += r.successes;
          if (r.mu_abs_ms != null) {
            cur.mu_w += Number(r.mu_abs_ms) * r.attempts;
            cur.mu_w_denom += r.attempts;
          }
          lmap.set(r.duration_label, cur);
        }
        const lineAgg = Array.from(lmap.entries()).map(([label, acc]) => ({
          duration_label: label,
          attempts: acc.attempts,
          successes: acc.successes,
          hit_pct: acc.attempts ? (100 * acc.successes) / acc.attempts : 0,
          mu_abs_ms: acc.mu_w_denom ? acc.mu_w / acc.mu_w_denom : null,
        })).sort((a, b) => b.attempts - a.attempts);

        // ---- Aggregate INTERVALS
        const icRows = (icRes.data ?? []) as IcRow[];
        type IcAcc = { attempts: number; correct: number };
        const icmap = new Map<number, IcAcc>();
        for (const r of icRows) {
          const cur = icmap.get(r.semitones) ?? { attempts: 0, correct: 0 };
          cur.attempts += r.attempts;
          cur.correct += r.correct;
          icmap.set(r.semitones, cur);
        }
        const intervalsAgg = Array.from(icmap.entries()).map(([semi, acc]) => ({
          semitones: semi,
          attempts: acc.attempts,
          correct: acc.correct,
        })).sort((a, b) => a.semitones - b.semitones);

        // Push details
        if (cancel) return;
        setPitchNotes(pitchAgg);
        setMelodyDur(melodyAgg);
        setLineDur(lineAgg);
        setIntervals(intervalsAgg);

        // ---- Header summary from lesson_results + details
        const avg = (nums: Array<number | null>) => {
          const vals = nums.filter((v): v is number => v != null && Number.isFinite(v));
          if (!vals.length) return null;
          return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
        };
        const final = avg(filtered.map(r => safeNum(r.final_percent)));
        const mel = avg(filtered.map(r => safeNum(r.rhythm_melody_percent)));
        const line = avg(filtered.map(r => safeNum(r.rhythm_line_percent)));
        const attemptsTotal = intervalsAgg.reduce((a, r) => a + r.attempts, 0);
        const correctTotal = intervalsAgg.reduce((a, r) => a + r.correct, 0);
        const intervalsPctAgg = attemptsTotal ? Math.round((100 * correctTotal) / attemptsTotal) : null;

        setFinalPct(final);
        setMelodyPct(mel);
        setLinePct(line);
        setIntervalsPct(intervalsPctAgg);

        // Pitch headline from pitch notes aggregation (preferred)
        setTimeOnPitchPct(timeOnPct);
        setPitchMae(maeCents);
        setPitchPct(timeOnPct); // align "Pitch" with on-pitch headline
      } catch (e: unknown) {
        if (!cancel) {
          setDetailsErr(e instanceof Error ? e.message : 'Failed to load details');
          setPitchNotes([]); setMelodyDur([]); setLineDur([]); setIntervals([]);
          setFinalPct(null); setPitchPct(null); setTimeOnPitchPct(null);
          setPitchMae(null); setMelodyPct(null); setLinePct(null); setIntervalsPct(null);
        }
      } finally {
        if (!cancel) setDetailsLoading(false);
      }
    })();
    return () => { cancel = true; };
  }, [filtered]);

  const courseOptions = React.useMemo(
    () => COURSES.map(c => ({ slug: c.slug, title: c.title, lessons: c.lessons.map(l => ({ slug: l.slug, title: l.title })) })),
    []
  );
  const selectedCourse = courseOptions.find(c => c.slug === course) || null;
  const lessonOptions = selectedCourse?.lessons ?? [];

  // if course changes to 'all', ensure lesson resets to 'all'
  React.useEffect(() => {
    if (course === 'all') setLesson('all');
  }, [course]);

  // Visibility flags mirror detail-card presence
  const showPitch = pitchNotes.length > 0;
  const showMelody = melodyDur.length > 0;
  const showLine = lineDur.length > 0;
  const showIntervals = intervals.length > 0;

  return (
    <section className="w-full h-full">
      {/* Minimal header row: JUST the 3 dropdowns on the left; no title, no counts, no outer card */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Recency */}
        <select
          aria-label="Recency"
          value={recency}
          onChange={(e) => setRecency(e.target.value as RecencyKey)}
          className="rounded-lg border border-[#d2d2d2] bg-[#f4f4f4] px-2 py-1 text-xs outline-none hover:bg-[#f8f8f8]"
        >
          {RECENCY_OPTS.map(opt => (
            <option key={opt.key} value={opt.key}>{opt.label}</option>
          ))}
        </select>

        {/* Course */}
        <select
          aria-label="Course"
          value={course}
          onChange={(e) => setCourse(e.target.value)}
          className="rounded-lg border border-[#d2d2d2] bg-[#f4f4f4] px-2 py-1 text-xs outline-none hover:bg-[#f8f8f8]"
        >
          <option value="all">All courses</option>
          {courseOptions.map(c => (
            <option key={c.slug} value={c.slug}>{c.title}</option>
          ))}
        </select>

        {/* Lesson */}
        <select
          aria-label="Lesson"
          value={lesson}
          onChange={(e) => setLesson(e.target.value)}
          disabled={course === 'all'}
          className="rounded-lg border border-[#d2d2d2] bg-[#f4f4f4] px-2 py-1 text-xs outline-none hover:bg-[#f8f8f8] disabled:opacity-50"
        >
          <option value="all">All lessons</option>
          {lessonOptions.map(l => (
            <option key={l.slug} value={l.slug}>{l.title}</option>
          ))}
        </select>
      </div>

      {/* Summary row */}
      <div className="mt-3">
        <HeaderSummary
          finalPct={finalPct}
          pitchPct={pitchPct}
          timeOnPitchPct={timeOnPitchPct}
          pitchMae={pitchMae}
          melodyPct={melodyPct}
          linePct={linePct}
          intervalsPct={intervalsPct}
          showPitch={showPitch}
          showMelody={showMelody}
          showLine={showLine}
          showIntervals={showIntervals}
        />
      </div>

      {/* Details grid */}
      <div className="mt-3">
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="h-28 rounded-2xl border shadow-sm animate-pulse"
                style={{
                  borderColor: '#d2d2d2',
                  backgroundImage: 'linear-gradient(to bottom, #f2f2f2, #eeeeee)',
                }}
              />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-sm text-[#6b6b6b]">No results match your filters.</div>
        ) : (
          <CombinedDetails
            pitchNotes={pitchNotes}
            melodyDur={melodyDur}
            lineDur={lineDur}
            intervals={intervals}
            pitchSummary={{ timeOnPct: timeOnPitchPct, maeCents: pitchMae }}
            loading={detailsLoading}
            err={detailsErr}
          />
        )}
      </div>

      {error ? <div className="mt-2 text-sm text-[#dc2626]">{error}</div> : null}
    </section>
  );
}
