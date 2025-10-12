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
      {/* Row 0: four banner cards (2:1) — wrappers control the height */}
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

      {/* Rows 1–2: custom bento */}
      {/* Grid is 8 columns so we can do: 
          Row 1 -> [Performance span-4] [Completed Lessons span-3] [spacer span-1]
          Row 2 -> [Pitch Focus span-4] [Intervals span-4] */}
      <div
        className="
          grid gap-6
          sm:grid-cols-8
          [grid-auto-rows:minmax(360px,auto)]
        "
      >
        {/* Row 1 */}
        <div className="sm:col-span-5"><PerformanceCard /></div>
        <div className="sm:col-span-3"><MilestonesCard /></div>

        {/* Row 2 */}
        <div className="sm:col-span-4"><PitchFocusCard /></div>
        <div className="sm:col-span-4"><IntervalsCard /></div>
      </div>
    </section>
  );
}
