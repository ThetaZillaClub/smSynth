// components/stats/ResultsList.tsx
'use client';

import * as React from 'react';
import ScrollArea from '@/components/ui/scrollbar';

export type ResultRow = {
  id: string;
  when: Date;
  course: string;
  title: string;
  final: number | null;
  pitch: number | null;
  melody: number | null;
  line: number | null;
  intervals: number | null;
  // extras used for title tooltip if you want (optional)
  pitchTimeOn?: number | null; // %
  pitchMae?: number | null;    // cents
};

export default function ResultsList({
  rows,
  selectedId,
  onSelect,
  className = '',
}: {
  rows: ResultRow[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  className?: string;
}) {
  return (
    <div
      className={[
        'rounded-2xl border border-[#d2d2d2] bg-gradient-to-b from-[#f2f2f2] to-[#eeeeee] shadow-sm',
        'h-full overflow-hidden grid grid-rows-[auto_minmax(0,1fr)]',
        className,
      ].join(' ')}
    >
      <div className="flex items-baseline justify-between px-6 pt-6">
        <h3 className="text-2xl font-semibold">Your Recent Results</h3>
        <div className="text-xs text-[#0f0f0f]/60">{rows.length ? `${rows.length} rows` : ''}</div>
      </div>

      {rows.length === 0 ? (
        <div className="p-10 grid place-items-center text-base text-[#0f0f0f]">No results yet.</div>
      ) : (
        <ScrollArea className="p-6 h-full min-h-0">
          <table className="min-w-full text-sm">
            <thead className="sticky top-0 bg-[#f3f3f3] text-[#0f0f0f]/80">
              <tr>
                <th className="text-left font-semibold px-3 py-2">Date</th>
                <th className="text-left font-semibold px-3 py-2">Course</th>
                <th className="text-left font-semibold px-3 py-2">Lesson</th>
                <th className="text-right font-semibold px-3 py-2">Final</th>
                <th className="text-right font-semibold px-3 py-2">Pitch</th>
                <th className="text-right font-semibold px-3 py-2">Melody</th>
                <th className="text-right font-semibold px-3 py-2">Rhythm</th>
                <th className="text-right font-semibold px-3 py-2">Intervals</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const sel = r.id === selectedId;
                const title =
                  r.pitchTimeOn != null || r.pitchMae != null
                    ? `On-pitch ${r.pitchTimeOn ?? '—'}% • MAE ${r.pitchMae ?? '—'}¢`
                    : undefined;
                return (
                  <tr
                    key={r.id}
                    aria-selected={sel}
                    onClick={() => onSelect(r.id)}
                    className={[
                      'border-t border-[#e7e7e7] cursor-pointer',
                      sel ? 'bg-[#eaeaea]' : 'hover:bg-white/60',
                    ].join(' ')}
                    title={title}
                  >
                    <td className="px-3 py-2 tabular-nums">{r.when.toISOString().slice(0, 10)}</td>
                    <td className="px-3 py-2">{r.course}</td>
                    <td className="px-3 py-2">{r.title}</td>
                    <td className="px-3 py-2 text-right font-semibold">{r.final == null ? '—' : `${r.final}%`}</td>
                    <td className="px-3 py-2 text-right">{r.pitch == null ? '—' : `${r.pitch}%`}</td>
                    <td className="px-3 py-2 text-right">{r.melody == null ? '—' : `${r.melody}%`}</td>
                    <td className="px-3 py-2 text-right">{r.line == null ? '—' : `${r.line}%`}</td>
                    <td className="px-3 py-2 text-right">{r.intervals == null ? '—' : `${r.intervals}%`}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </ScrollArea>
      )}
    </div>
  );
}
