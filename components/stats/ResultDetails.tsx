// components/stats/ResultDetails.tsx
'use client';

import * as React from 'react';
import { createClient } from '@/lib/supabase/client';

function safeNum(x: unknown): number | null {
  if (x == null) return null;
  const n = typeof x === 'number' ? x : Number(x);
  return Number.isFinite(n) ? n : null;
}

type PitchNoteRow = { midi: number; n: number; ratio: number; cents_mae: number };
type MelDurRow   = { duration_label: string; attempts: number; coverage_pct: number; first_voice_mu_abs_ms: number | null };
type LineDurRow  = { duration_label: string; attempts: number; successes: number; hit_pct: number; mu_abs_ms: number | null };
type IcRow       = { semitones: number; attempts: number; correct: number };

export interface ResultDetailsProps {
  resultId: string;
  pitchSummary?: { timeOnPct: number | null; maeCents: number | null };
}

export default function ResultDetails(props: ResultDetailsProps) {
  const { resultId, pitchSummary } = props;

  const [pitchNotes, setPitchNotes] = React.useState<PitchNoteRow[] | null>(null);
  const [melodyDur, setMelodyDur]   = React.useState<MelDurRow[] | null>(null);
  const [lineDur, setLineDur]       = React.useState<LineDurRow[] | null>(null);
  const [intervals, setIntervals]   = React.useState<IcRow[] | null>(null);
  const [err, setErr]               = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        const supabase = createClient();

        const [
          pitchRes,
          melDurRes,
          lineDurRes,
          icRes,
        ] = await Promise.all([
          supabase
            .from('lesson_result_pitch_notes')
            .select('midi,n,ratio,cents_mae')
            .eq('result_id', resultId)
            .order('n', { ascending: false }),
          supabase
            .from('lesson_result_melody_durations')
            .select('duration_label,attempts,coverage_pct,first_voice_mu_abs_ms')
            .eq('result_id', resultId)
            .order('created_at', { ascending: true }),
          supabase
            .from('lesson_result_rhythm_durations')
            .select('duration_label,attempts,successes,hit_pct,mu_abs_ms')
            .eq('result_id', resultId)
            .order('created_at', { ascending: true }),
          supabase
            .from('lesson_result_interval_classes')
            .select('semitones,attempts,correct')
            .eq('result_id', resultId)
            .order('semitones', { ascending: true }),
        ]);

        if (!cancel) {
          if (pitchRes.error) throw new Error(pitchRes.error.message);
          if (melDurRes.error) throw new Error(melDurRes.error.message);
          if (lineDurRes.error) throw new Error(lineDurRes.error.message);
          if (icRes.error)     throw new Error(icRes.error.message);

          setPitchNotes((pitchRes.data ?? []) as PitchNoteRow[]);
          setMelodyDur((melDurRes.data ?? []) as MelDurRow[]);
          setLineDur((lineDurRes.data ?? []) as LineDurRow[]);
          setIntervals((icRes.data ?? []) as IcRow[]);
        }
      } catch (e: any) {
        if (!cancel) setErr(e?.message ?? 'Failed to load details');
      }
    })();
    return () => { cancel = true; };
  }, [resultId]);

  const loading =
    pitchNotes === null || melodyDur === null || lineDur === null || intervals === null;

  // helpers
  const sum = (arr: number[]) => arr.reduce((a, b) => a + b, 0);

  // Weighted overall pitch (fallback if pitchSummary not passed)
  const wRatioPct = React.useMemo(() => {
    if (!pitchNotes?.length) return null;
    const totalN = sum(pitchNotes.map(r => r.n));
    if (!totalN) return null;
    const wr = pitchNotes.reduce((a, r) => a + r.ratio * r.n, 0) / totalN;
    return Math.round(wr * 1000) / 10; // 1 decimal
  }, [pitchNotes]);

  const wMae = React.useMemo(() => {
    if (!pitchNotes?.length) return null;
    const totalN = sum(pitchNotes.map(r => r.n));
    if (!totalN) return null;
    const wm = pitchNotes.reduce((a, r) => a + r.cents_mae * r.n, 0) / totalN;
    return Math.round(wm);
  }, [pitchNotes]);

  return (
    <div className="rounded-xl border border-[#e5e5e5] bg-[#f7f7f7] p-3">
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-28 rounded bg-[#e8e8e8] animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Pitch */}
          <Panel title="Pitch (per note)">
            <div className="text-[11px] text-[#555] mb-2">
              Overall:{' '}
              <b>
                {pitchSummary?.timeOnPct != null
                  ? `${pitchSummary.timeOnPct}% on-pitch`
                  : wRatioPct != null
                  ? `${wRatioPct}% on-pitch`
                  : '—'}
              </b>{' '}
              • MAE{' '}
              <b>
                {pitchSummary?.maeCents != null
                  ? `${pitchSummary.maeCents}¢`
                  : wMae != null
                  ? `${wMae}¢`
                  : '—'}
              </b>
            </div>
            <Table
              head={['MIDI', 'n', 'On-pitch %', 'MAE ¢']}
              rows={(pitchNotes ?? []).slice(0, 24).map(r => [
                String(r.midi),
                String(r.n),
                `${Math.round(r.ratio * 100)}%`,
                String(Math.round(r.cents_mae)),
              ])}
              empty="No pitch notes."
            />
          </Panel>

          {/* Melody durations */}
          <Panel title="Melody timing (by duration)">
            <Table
              head={['Dur.', 'Attempts', 'Coverage %', '1st-voice μ|Δt|']}
              rows={(melodyDur ?? []).map(r => [
                r.duration_label,
                String(r.attempts),
                `${Math.round(Number(r.coverage_pct))}%`,
                r.first_voice_mu_abs_ms == null ? '—' : `${Math.round(Number(r.first_voice_mu_abs_ms))}ms`,
              ])}
              empty="No melody rows."
            />
          </Panel>

          {/* Rhythm durations */}
          <Panel title="Rhythm line (by duration)">
            <Table
              head={['Dur.', 'Attempts', 'Hit %', 'μ|Δt|']}
              rows={(lineDur ?? []).map(r => [
                r.duration_label,
                String(r.attempts),
                `${Math.round(Number(r.hit_pct))}%`,
                r.mu_abs_ms == null ? '—' : `${Math.round(Number(r.mu_abs_ms))}ms`,
              ])}
              empty="No rhythm rows."
            />
          </Panel>

          {/* Intervals */}
          <Panel title="Intervals">
            <Table
              head={['Semitones', 'Attempts', 'Correct', '%']}
              rows={(intervals ?? []).map(r => {
                const pct = r.attempts ? Math.round((100 * r.correct) / r.attempts) : 0;
                return [String(r.semitones), String(r.attempts), String(r.correct), `${pct}%`];
              })}
              empty="No interval attempts."
            />
          </Panel>
        </div>
      )}
      {err ? <div className="mt-2 text-sm text-[#dc2626]">{err}</div> : null}
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-[#e5e7eb] bg-gradient-to-b from-white to-[#fafafa] p-3 shadow-sm">
      <div className="text-xs font-semibold text-[#0f0f0f]/80 mb-2">{title}</div>
      {children}
    </div>
  );
}

function Table({
  head,
  rows,
  empty,
}: {
  head: string[];
  rows: (string | number)[][];
  empty: string;
}) {
  return (
    <div className="overflow-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-left uppercase tracking-wide text-[#6b6b6b]">
            {head.map((h) => (
              <th key={h} className="px-2 py-1">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {!rows.length ? (
            <tr className="border-t border-[#eee]">
              <td className="px-2 py-1.5" colSpan={head.length}>{empty}</td>
            </tr>
          ) : (
            rows.map((r, i) => (
              <tr key={i} className="border-t border-[#eee]">
                {r.map((c, j) => (
                  <td key={j} className="px-2 py-1.5 align-middle">{c}</td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
