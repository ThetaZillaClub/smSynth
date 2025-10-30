// components/stats/CombinedDetails.tsx
'use client';

import * as React from 'react';

type PitchNoteRow = { midi: number; n: number; ratio: number; cents_mae: number };
type MelDurRow   = { duration_label: string; attempts: number; coverage_pct: number; first_voice_mu_abs_ms: number | null };
type LineDurRow  = { duration_label: string; attempts: number; successes: number; hit_pct: number; mu_abs_ms: number | null };
type IcRow       = { semitones: number; attempts: number; correct: number };

export interface CombinedDetailsProps {
  pitchNotes: PitchNoteRow[];
  melodyDur: MelDurRow[];
  lineDur: LineDurRow[];
  intervals: IcRow[];
  pitchSummary?: { timeOnPct: number | null; maeCents: number | null };
  loading?: boolean;
  err?: string | null;
}

export default function CombinedDetails({
  pitchNotes, melodyDur, lineDur, intervals, pitchSummary, loading = false, err = null,
}: CombinedDetailsProps) {
  const sum = (arr: number[]) => arr.reduce((a, b) => a + b, 0);

  const wRatioPct = React.useMemo(() => {
    if (!pitchNotes?.length) return null;
    const totalN = sum(pitchNotes.map(r => r.n));
    if (!totalN) return null;
    const wr = pitchNotes.reduce((a, r) => a + r.ratio * r.n, 0) / totalN;
    return Math.round(wr * 1000) / 10;
  }, [pitchNotes]);

  const wMae = React.useMemo(() => {
    if (!pitchNotes?.length) return null;
    const totalN = sum(pitchNotes.map(r => r.n));
    if (!totalN) return null;
    const wm = pitchNotes.reduce((a, r) => a + r.cents_mae * r.n, 0) / totalN;
    return Math.round(wm);
  }, [pitchNotes]);

  return (
    <>
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
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
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
              • MAE <b>{pitchSummary?.maeCents ?? wMae ?? '—'}¢</b>
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
    </>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div
      className="rounded-2xl border bg-gradient-to-b shadow-sm p-3"
      style={{
        borderColor: '#d2d2d2',
        backgroundImage: 'linear-gradient(to bottom, #f2f2f2, #eeeeee)',
      }}
    >
      <div className="text-xs font-semibold text-[#0f0f0f]/80 mb-2">{title}</div>
      {children}
    </div>
  );
}

function Table({
  head, rows, empty,
}: { head: string[]; rows: (string | number)[][]; empty: string }) {
  return (
    <div className="overflow-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-left uppercase tracking-wide text-[#6b6b6b]">
            {head.map((h) => <th key={h} className="px-2 py-1">{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {!rows.length ? (
            <tr className="border-t border-[#dddddd]">
              <td className="px-2 py-1.5" colSpan={head.length}>{empty}</td>
            </tr>
          ) : rows.map((r, i) => (
            <tr key={i} className="border-t border-b border-[#dddddd]">
              {r.map((c, j) => <td key={j} className="px-2 py-1.5 align-middle">{c}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
