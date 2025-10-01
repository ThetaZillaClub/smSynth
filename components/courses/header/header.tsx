'use client';

import * as React from 'react';

type TabKey = 'in-progress' | 'all-courses';

export default function Header({
  active,
  onChange,
}: {
  active: TabKey;
  onChange: (t: TabKey) => void;
}) {
  // “smaller quicker”: default is compact; scales up at md+
  const base =
    'w-full h-10 md:h-12 text-sm md:text-base font-medium flex items-center justify-center transition select-none';
  const activeCls = 'bg-[#f9f9f9] text-[#0f0f0f]';
  const idleCls = 'hover:bg-[#f2f2f2] active:bg-[#f2f2f2] text-[#0f0f0f]';

  return (
    <div className="bg-[#e8e8e8] border-b border-[#d7d7d7]">
      <div className="grid grid-cols-2">
        <button
          type="button"
          className={[base, active === 'in-progress' ? activeCls : idleCls].join(' ')}
          onClick={() => onChange('in-progress')}
        >
          In Progress
        </button>
        <button
          type="button"
          className={[base, active === 'all-courses' ? activeCls : idleCls].join(' ')}
          onClick={() => onChange('all-courses')}
        >
          All Courses
        </button>
      </div>
    </div>
  );
}
