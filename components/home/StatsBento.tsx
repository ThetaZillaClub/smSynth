// components/home/StatsBento.tsx
'use client';
import * as React from 'react';
import { HomeResultsProvider } from './data/HomeResultsProvider'; // ⬅️ new
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
    <HomeResultsProvider>
      {/* ...no change below here... */}
      <section className="w-full space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="h-[90px]"><RatingCard compact /></div>
          <div className="h-[90px]"><RangeCard compact /></div>
          <div className="h-[90px]"><CompletedCountCard compact/></div>
          <div className="h-[90px]"><MasteredCountCard compact/></div>
        </div>
        <div className="grid gap-6 sm:grid-cols-8 [grid-auto-rows:minmax(360px,auto)]">
          <div className="sm:col-span-5"><PerformanceCard /></div>
          <div className="sm:col-span-3"><LessonsCard /></div>
          <div className="sm:col-span-4"><PitchFocusCard /></div>
          <div className="sm:col-span-4"><IntervalsCard /></div>
        </div>
      </section>
    </HomeResultsProvider>
  );
}
