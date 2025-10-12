// components/home/StatsBento.tsx
'use client';

import * as React from 'react';
import PerformanceCard from './statsbento/PerformanceCard';
import RatingCard from './statsbento/RatingCard';
import PitchFocusCard from './statsbento/PitchFocusCard';
import IntervalsCard from './statsbento/IntervalsCard';
import MilestonesCard from './statsbento/MilestonesCard';
import RangeCard from './statsbento/RangeCard';
import CompletedCountCard from './statsbento/CompletedCountCard';
import MasteredCountCard from './statsbento/MasteredCountCard';

export default function StatsBento() {
  return (
    <section className="w-full space-y-6">
      {/* First row: four banner cards (2:1) — wrappers control the height */}
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <div className="aspect-[2/1] min-h-[96px]">
          <RatingCard compact />
        </div>
        <div className="aspect-[2/1] min-h-[96px]">
          <RangeCard />
        </div>
        <div className="aspect-[2/1] min-h-[96px]">
          <CompletedCountCard />
        </div>
        <div className="aspect-[2/1] min-h-[96px]">
          <MasteredCountCard />
        </div>
      </div>

      {/* Second row: 2×2 bento (PitchFocus large TL, Performance small TR, Completed Lessons small BL, Intervals large BR) */}
      <div
        className="
          grid gap-6
          sm:grid-cols-7
          [grid-auto-rows:minmax(360px,auto)]
        "
      >
        <div className="sm:col-span-4"><PitchFocusCard /></div>
        <div className="sm:col-span-3"><PerformanceCard /></div>
        <div className="sm:col-span-3"><MilestonesCard /></div>
        <div className="sm:col-span-4"><IntervalsCard /></div>
      </div>
    </section>
  );
}
