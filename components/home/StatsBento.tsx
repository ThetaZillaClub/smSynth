// components/home/StatsBento.tsx
'use client';

import * as React from 'react';
import PerformanceCard from './statsbento/PerformanceCard';
import RatingCard from './statsbento/RatingCard';
import PitchFocusCard from './statsbento/PitchFocusCard';
import IntervalsCard from './statsbento/IntervalsCard';
import MilestonesCard from './statsbento/MilestonesCard';
import RangeCard from './statsbento/RangeCard';

export default function StatsBento() {
  return (
    <section
      className="
        grid w-full
        gap-6
        sm:grid-cols-6
        [grid-auto-rows:minmax(320px,auto)]
        md:[grid-auto-rows:minmax(360px,auto)]
        lg:[grid-auto-rows:minmax(420px,auto)]
      "
    >
      <div className="sm:col-span-4"><PerformanceCard /></div>
      <div className="sm:col-span-2"><RatingCard /></div>
      <div className="sm:col-span-3"><PitchFocusCard /></div>
      <div className="sm:col-span-3"><IntervalsCard /></div>
      <div className="sm:col-span-3"><MilestonesCard /></div>
      <div className="sm:col-span-3"><RangeCard /></div>
    </section>
  );
}
