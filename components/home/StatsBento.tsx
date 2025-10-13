// components/home/StatsBento.tsx
'use client';
import * as React from 'react';
import { HomeResultsProvider } from './data/HomeResultsProvider';
import PerformanceCard from './statsbento/PerformanceCard';
import RatingCard from './statsbento/RatingCard';
import LessonsCard from './statsbento/LessonsCard';
import RangeCard from './statsbento/RangeCard';
import CompletedCountCard from './statsbento/CompletedCountCard';
import MasteredCountCard from './statsbento/MasteredCountCard';
import HomeCardGrid from './HomeCardGrid';
import RadialsTabsCard from './statsbento/RadialsTabsCard'; // ⬅️ NEW

export default function StatsBento() {
  return (
    <HomeResultsProvider>
      <section className="w-full space-y-6">
        {/* Top compact stats row */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="h-[90px]"><RatingCard compact /></div>
          <div className="h-[90px]"><RangeCard compact /></div>
          <div className="h-[90px]"><CompletedCountCard compact/></div>
          <div className="h-[90px]"><MasteredCountCard compact/></div>
        </div>

        {/* Main bento */}
        <div className="grid gap-6 sm:grid-cols-8 [grid-auto-rows:minmax(360px,auto)]">
          {/* Row 1 */}
          <div className="sm:col-span-5"><PerformanceCard /></div>
          <div className="sm:col-span-3 h-full">
            <HomeCardGrid variant="column" />
          </div>

          {/* Row 2 — first column: Lessons, second column: combined radial charts (same span as Performance) */}
          <div className="sm:col-span-3">
            <LessonsCard />
          </div>
          <div className="sm:col-span-5">
            <RadialsTabsCard />
          </div>

          {/* Removed the separate Pitch/Intervals cards and the full-width Lessons row */}
          {/* <div className="sm:col-span-4"><PitchFocusCard /></div>
              <div className="sm:col-span-4"><IntervalsCard /></div>
              <div className="sm:col-span-8"><LessonsCard /></div> */}
        </div>
      </section>
    </HomeResultsProvider>
  );
}
