// components/home/StatsBento.tsx
'use client';
import * as React from 'react';
import { HomeResultsProvider } from './data/HomeResultsProvider';
import PerformanceCard from './statsbento/PerformanceCard';
import RatingCard from './statsbento/RatingCard';
import RangeCard from './statsbento/RangeCard';
import CompletedCountCard from './statsbento/CompletedCountCard';
import MasteredCountCard from './statsbento/MasteredCountCard';
import HomeCardGrid from './HomeCardGrid';
import RadialsTabsCard from './statsbento/RadialsTabsCard'; // ⬅️ tabs
import CoursesCard from './statsbento/CoursesCard';          // ⬅️ NEW (replaces LessonsCard)

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

          {/* Row 2 — left: Course Progress (was Lessons), right: radials */}
          <div className="sm:col-span-3">
            <CoursesCard />
          </div>
          <div className="sm:col-span-5">
            <RadialsTabsCard />
          </div>
        </div>
      </section>
    </HomeResultsProvider>
  );
}
