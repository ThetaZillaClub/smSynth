// components/history/ResultDetails.tsx
'use client';

import * as React from 'react';
import { createClient } from '@/lib/supabase/client';

type PitchNoteRow = { midi: number; n: number; ratio: number; cents_mae: number };
type MelDurRow   = { duration_label: string; attempts: number; coverage_pct: number; first_voice_mu_abs_ms: number | null };
type LineDurRow  = { duration_label: string; attempts: number; successes: number; hit_pct: number; mu_abs_ms: number | null };
type IcRow       = { semitones: number; attempts: number; correct: number };

export interface ResultDetailsProps {
  resultId: string;
  pitchSummary?: { timeOnPct: number | null; maeCents: number | null };
}

/** MIDI → note name (C octave, flats preferred). */
function midiToNoteFlat(m: number): string {
  const pc = ((m % 12) + 12) % 12;
  const oct = Math.floor(m / 12) - 1;
  const names = ['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B'] as const;
  return `${names[pc]}${oct}`;
}
/** Semitone → interval label */
function intervalName(semi: number): string {
  const s = Math.abs(Math.round(semi));
  const map: Record<number, string> = {
    0: 'Unison', 1: 'Minor 2nd', 2: 'Major 2nd', 3: 'Minor 3rd', 4: 'Major 3rd',
    5: 'Perfect Fourth', 6: 'Tritone', 7: 'Perfect Fifth', 8: 'Minor 6th', 9: 'Major 6th',
    10: 'Minor 7th', 11: 'Major 7th', 12: 'Octave',
  };
  if (map[s]) return map[s];
  if (s % 12 === 0) { const o = s / 12; return o === 1 ? 'Octave' : `${o} Octaves`; }
  const base = map[s % 12] ?? `${s} semitones`;
  const octs = Math.floor(s / 12);
  return octs ? `${base} + ${octs} Octave${octs > 1 ? 's' : ''}` : base;
}

/** ---------- Generic sortable table with column highlight & fixed widths ---------- */
type Col<Row> = {
  key: string;
  label: string;
  get?: (row: Row) => number | string | null;
  render?: (row: Row) => React.ReactNode;
  align?: 'left' | 'right' | 'center';
};
type SortState = { key: string; dir: 'asc' | 'desc' };

const HI_BG = 'rgba(132,179,246,0.25)'; // #84b3f6 @ 25% — keeps zebra visible

function SortableTable<Row extends object>({
  columns, rows, empty, defaultSort, colPercents = [40, 20, 20, 20],
}: {
  columns: Col<Row>[];
  rows: Row[];
  empty: string;
  defaultSort: SortState;
  colPercents?: number[]; // widths as percentages, applied via <colgroup>
}) {
  const [sort, setSort] = React.useState<SortState>(defaultSort);
  const toggle = (key: string) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'desc' }));

  const activeIdx = React.useMemo(
    () => Math.max(0, columns.findIndex((c) => c.key === sort.key)),
    [columns, sort.key]
  );

  const sorted = React.useMemo(() => {
    const col = columns[activeIdx] ?? columns[0];
    const getVal = (r: Row) => (col.get ? col.get(r) : (r as any)[col.key]);
    const cmp = (a: Row, b: Row) => {
      const va = getVal(a); const vb = getVal(b);
      if (typeof va === 'number' && typeof vb === 'number') return va - vb;
      if (typeof va === 'string' && typeof vb === 'string') return va.localeCompare(vb);
      if (va == null && vb != null) return 1;
      if (vb == null && va != null) return -1;
      return 0;
    };
    const arr = [...rows].sort(cmp);
    if (sort.dir === 'desc') arr.reverse();
    return arr;
  }, [rows, columns, activeIdx, sort.dir]);

  return (
    <div className="overflow-auto">
      <table className="w-full text-xs table-fixed">
        <colgroup>
          {columns.map((_, i) => (
            <col key={i} style={{ width: `${colPercents[i] ?? colPercents[colPercents.length - 1] ?? 25}%` }} />
          ))}
        </colgroup>
        <thead>
          <tr className="uppercase tracking-wide text-[#6b6b6b]">
            {columns.map((c, idx) => {
              const active = idx === activeIdx;
              const thAlign =
                c.align === 'right' ? 'text-right' : c.align === 'center' ? 'text-center' : 'text-left';
              return (
                <th
                  key={c.key}
                  className={`px-2 py-1 cursor-pointer select-none ${thAlign}`}
                  onClick={() => toggle(c.key)}
                  title={`Sort by ${c.label}`}
                  style={active ? { backgroundColor: HI_BG } : undefined} // no underline
                >
                  <span className={active ? 'text-[#6b6b6b]' : ''}>{c.label}</span>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {!sorted.length ? (
            <tr className="border-t border-[#dddddd]">
              <td className="px-2 py-1.5" colSpan={columns.length}>
                {empty}
              </td>
            </tr>
          ) : (
            sorted.map((r, i) => (
              <tr
                key={i}
                className="border-t border-b border-[#dddddd] odd:bg-[#f4f4f4] hover:bg-[#efefef] transition-colors"
              >
                {columns.map((c, j) => {
                  const tdAlign =
                    c.align === 'right' ? 'text-right' : c.align === 'center' ? 'text-center' : 'text-left';
                  return (
                    <td
                      key={c.key}
                      className={`px-2 py-1.5 align-middle ${tdAlign} ${c.align === 'right' ? 'tabular-nums' : ''}`}
                      style={j === activeIdx ? { backgroundColor: HI_BG } : undefined}
                    >
                      {c.render ? c.render(r) : String((r as any)[c.key] ?? '—')}
                    </td>
                  );
                })}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
/** ---------- /Sortable table ---------- */

export default function ResultDetails(props: ResultDetailsProps) {
  const { resultId } = props;

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
        const [pitchRes, melDurRes, lineDurRes, icRes] = await Promise.all([
          supabase.from('lesson_result_pitch_notes')
            .select('midi,n,ratio,cents_mae').eq('result_id', resultId).order('n', { ascending: false }),
          supabase.from('lesson_result_melody_durations')
            .select('duration_label,attempts,coverage_pct,first_voice_mu_abs_ms').eq('result_id', resultId).order('created_at', { ascending: true }),
          supabase.from('lesson_result_rhythm_durations')
            .select('duration_label,attempts,successes,hit_pct,mu_abs_ms').eq('result_id', resultId).order('created_at', { ascending: true }),
          supabase.from('lesson_result_interval_classes')
            .select('semitones,attempts,correct').eq('result_id', resultId).order('semitones', { ascending: true }),
        ]);
        if (!cancel) {
          if (pitchRes.error) throw new Error(pitchRes.error.message);
          if (melDurRes.error) throw new Error(melDurRes.error.message);
          if (lineDurRes.error) throw new Error(lineDurRes.error.message);
          if (icRes.error) throw new Error(icRes.error.message);

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

  const loading = pitchNotes === null || melodyDur === null || lineDur === null || intervals === null;

  return (
    <>
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-28 rounded-2xl border shadow-sm animate-pulse"
              style={{ borderColor: '#d2d2d2', backgroundImage: 'linear-gradient(to bottom, #f2f2f2, #eeeeee)' }}
            />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {/* Pitch */}
          <Panel title="Pitch">
            <SortableTable
              defaultSort={{ key: 'ratioPct', dir: 'desc' }} // On-pitch %
              empty="No pitch notes."
              columns={[
                { key: 'note', label: 'Note', get: (r) => (r as any).midi, render: (r) => (r as any).note, align: 'left' },
                { key: 'attempts', label: 'Attempts', get: (r) => (r as any).attempts, align: 'right' },
                { key: 'ratioPct', label: 'On-pitch %', get: (r) => (r as any).ratioPct, align: 'right' },
                { key: 'precision', label: 'Precision ¢', get: (r) => (r as any).precision, align: 'right' },
              ]}
              rows={(pitchNotes ?? []).slice(0, 24).map((r) => ({
                note: midiToNoteFlat(r.midi),
                midi: r.midi,
                attempts: r.n,
                ratioPct: Math.round(r.ratio * 100),
                precision: Math.round(r.cents_mae),
              }))}
            />
          </Panel>

          {/* Melody timing */}
          <Panel title="Melody timing">
            <SortableTable
              defaultSort={{ key: 'coveragePct', dir: 'desc' }}
              empty="No melody rows."
              columns={[
                { key: 'dur', label: 'Note Value', get: (r) => (r as any).dur, align: 'left' },
                { key: 'attempts', label: 'Attempts', get: (r) => (r as any).attempts, align: 'right' },
                { key: 'coveragePct', label: 'Coverage %', get: (r) => (r as any).coveragePct, align: 'right' },
                { key: 'avgOffset', label: 'Average Offset', get: (r) => (r as any).avgOffset, align: 'right' },
              ]}
              rows={(melodyDur ?? []).map((r) => ({
                dur: r.duration_label,
                attempts: r.attempts,
                coveragePct: Math.round(Number(r.coverage_pct)),
                avgOffset: r.first_voice_mu_abs_ms == null ? null : Math.round(Number(r.first_voice_mu_abs_ms)),
              }))}
            />
          </Panel>

          {/* Rhythm line */}
          <Panel title="Rhythm line">
            <SortableTable
              defaultSort={{ key: 'hitPct', dir: 'desc' }}
              empty="No rhythm rows."
              columns={[
                { key: 'dur', label: 'Note Value', get: (r) => (r as any).dur, align: 'left' },
                { key: 'attempts', label: 'Attempts', get: (r) => (r as any).attempts, align: 'right' },
                { key: 'hitPct', label: 'Hit %', get: (r) => (r as any).hitPct, align: 'right' },
                { key: 'avgOffset', label: 'Average Offset', get: (r) => (r as any).avgOffset, align: 'right' },
              ]}
              rows={(lineDur ?? []).map((r) => ({
                dur: r.duration_label,
                attempts: r.attempts,
                hitPct: Math.round(Number(r.hit_pct)),
                avgOffset: r.mu_abs_ms == null ? null : Math.round(Number(r.mu_abs_ms)),
              }))}
            />
          </Panel>

          {/* Intervals */}
          <Panel title="Intervals">
            <SortableTable
              defaultSort={{ key: 'pct', dir: 'desc' }}
              empty="No interval attempts."
              columns={[
                { key: 'interval', label: 'Interval', get: (r) => (r as any).semitones, render: (r) => (r as any).interval, align: 'left' },
                { key: 'attempts', label: 'Attempts', get: (r) => (r as any).attempts, align: 'right' },
                { key: 'correct', label: 'Correct', get: (r) => (r as any).correct, align: 'right' },
                { key: 'pct', label: '%', get: (r) => (r as any).pct, align: 'right' },
              ]}
              rows={(intervals ?? []).map((r) => {
                const pct = r.attempts ? Math.round((100 * r.correct) / r.attempts) : 0;
                return {
                  interval: intervalName(r.semitones),
                  semitones: r.semitones,
                  attempts: r.attempts,
                  correct: r.correct,
                  pct,
                };
              })}
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
      style={{ borderColor: '#d2d2d2', backgroundImage: 'linear-gradient(to bottom, #f2f2f2, #eeeeee)' }}
    >
      <div className="mb-2 font-bold tracking-tight text-[#0f0f0f]" style={{ fontSize: 'clamp(16px, 2vw, 22px)' }}>
        {title}
      </div>
      {children}
    </div>
  );
}
