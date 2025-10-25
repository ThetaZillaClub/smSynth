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
import RadialsTabsCard from './statsbento/RadialsTabsCard';
import CoursesCard from './statsbento/CoursesCard';

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

        {/* Main bento — small base row, then explicit row spans */}
        <div className="grid gap-6 sm:grid-cols-8 [grid-auto-rows:90px]">
          {/* Row group A */}
          <div className="sm:col-span-5 row-span-4 h-full">
            <PerformanceCard />
          </div>
          <div className="sm:col-span-3 row-span-4 h-full">
            <HomeCardGrid variant="column" />
          </div>

          {/* Row group B */}
          <div className="sm:col-span-3 row-span-5">
            <CoursesCard />
          </div>
          <div className="sm:col-span-5 row-span-5">
            <RadialsTabsCard />
          </div>
        </div>
      </section>
    </HomeResultsProvider>
  );
}
