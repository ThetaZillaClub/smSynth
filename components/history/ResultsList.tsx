// components/history/ResultsList.tsx
'use client';

import * as React from 'react';
import ScrollArea from '@/components/ui/scrollbar';

export type ResultRow = {
  id: string;
  when: Date;
  course: string;
  title: string;
  final: number | null;
  // retained for detail view (not rendered here):
  pitch: number | null;
  melody: number | null;
  line: number | null;
  intervals: number | null;
  pitchTimeOn?: number | null;
  pitchMae?: number | null;
};

type CourseOpt = { slug: string; title: string };

export default function ResultsList({
  rows,
  selectedId,
  onSelect,
  className = '',
  courseFilter,
  onCourseChange,
  courseOptions,
}: {
  rows: ResultRow[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  className?: string;
  courseFilter: string | 'all';
  onCourseChange: (slugOrAll: string) => void;
  courseOptions: CourseOpt[];
}) {
  // Match our other table cards
  const CARD_TOP_BG = '#f2f2f2';

  return (
    <div
      className={[
        'h-full overflow-hidden grid grid-rows-[auto_minmax(0,1fr)]',
        className,
      ].join(' ')}
    >
      {/* Top row: ONLY the dropdown, aligned left */}
      <div className="flex items-center justify-start gap-2 px-6 pb-2">
        <select
          aria-label="Course"
          value={courseFilter}
          onChange={(e) => onCourseChange(e.target.value)}
          className="rounded-lg border border-[#d2d2d2] bg-[#f4f4f4] px-2 py-1 text-xs outline-none hover:bg-[#f8f8f8]"
        >
          <option value="all">All courses</option>
          {courseOptions.map((c) => (
            <option key={c.slug} value={c.slug}>
              {c.title}
            </option>
          ))}
        </select>
      </div>

      {/* Card JUST for the table + internal scrollbar */}
      <div className="px-6 h-full min-h-0">
        <div
          className="rounded-2xl border border-[#d2d2d2] shadow-sm h-full overflow-hidden"
          style={{ backgroundImage: 'linear-gradient(to bottom, #f2f2f2, #eeeeee)' }}
        >
          {rows.length === 0 ? (
            <div className="p-10 grid place-items-center text-base text-[#0f0f0f]">
              No results yet.
            </div>
          ) : (
            <ScrollArea className="p-6 h-full min-h-0">
              <table className="min-w-full text-sm">
                <thead
                  className="sticky top-0 text-[#0f0f0f]/80"
                  style={{ backgroundColor: CARD_TOP_BG }}
                >
                  <tr>
                    <th className="text-left font-semibold px-3 py-2">Date</th>
                    <th className="text-left font-semibold px-3 py-2">Lesson</th>
                    <th className="text-right font-semibold px-3 py-2">Final</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const sel = r.id === selectedId;
                    return (
                      <tr
                        key={r.id}
                        aria-selected={sel}
                        onClick={() => onSelect(r.id)}
                        className={[
                          // base borders
                          'border-t-2 border-b-2 border-[#dddddd] cursor-pointer transition-colors',
                          // zebra striping starts at first row
                          'odd:bg-[#f4f4f4]',
                          // hover state
                          'hover:bg-[#eaeaea]',
                          // selection state: force it to win over zebra & hover
                          'aria-selected:!bg-[#f9f9f9]',
                        ].join(' ')}
                      >
                        <td className="px-3 py-2 tabular-nums">
                          {r.when.toISOString().slice(0, 10)}
                        </td>
                        <td className="px-3 py-2">{r.title}</td>
                        <td className="px-3 py-2 text-right font-semibold">
                          {r.final == null ? '—' : `${r.final}%`}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </ScrollArea>
          )}
        </div>
      </div>
    </div>
  );
}
