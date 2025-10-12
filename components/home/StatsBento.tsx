// components/home/StatsBento.tsx
'use client';

import * as React from 'react';
import PerformanceCard from './statsbento/PerformanceCard';
import RatingCard from './statsbento/RatingCard';
import PitchFocusCard from './statsbento/PitchFocusCard';
import IntervalsCard from './statsbento/IntervalsCard';
import LessonsCard from './statsbento/LessonsCard';
import RangeCard from './statsbento/RangeCard';
import CompletedCountCard from './statsbento/CompletedCountCard';
import MasteredCountCard from './statsbento/MasteredCountCard';

export default function StatsBento() {
  return (
    <section className="w-full space-y-6">
      {/* Row 0: four compact banner cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="h-[90px]">
          <RatingCard compact />
        </div>
        <div className="h-[90px]">
          <RangeCard compact />
        </div>
        <div className="h-[90px]">
          <CompletedCountCard compact/>
        </div>
        <div className="h-[90px]">
          <MasteredCountCard compact/>
        </div>
      </div>

      {/* Rows 1–2 */}
      <div
        className="
          grid gap-6
          sm:grid-cols-8
          [grid-auto-rows:minmax(360px,auto)]
        "
      >
        {/* Row 1 */}
        <div className="sm:col-span-5"><PerformanceCard /></div>
        <div className="sm:col-span-3"><LessonsCard /></div>

        {/* Row 2 */}
        <div className="sm:col-span-4"><PitchFocusCard /></div>
        <div className="sm:col-span-4"><IntervalsCard /></div>
      </div>
    </section>
  );
}
