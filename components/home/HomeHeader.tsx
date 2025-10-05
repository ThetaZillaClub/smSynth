'use client';

import * as React from 'react';
import Image from 'next/image';

export default function HomeHeader({
  displayName,
  avatarUrl,
}: {
  displayName: string;
  avatarUrl: string | null;
}) {
  const initial = (displayName?.trim()?.[0] ?? '?').toUpperCase();

  return (
    <header className="flex items-center justify-between gap-4">
      <div className="flex items-center gap-4">
        <div className="relative h-12 w-12 md:h-14 md:w-14 rounded-full overflow-hidden bg-[#f9f9f9] border border-[#d2d2d2] grid place-items-center">
          {avatarUrl ? (
            <Image
              src={avatarUrl}
              alt={`${displayName} avatar`}
              fill
              className="object-cover"
              sizes="56px"
              unoptimized
            />
          ) : (
            <span className="text-base md:text-lg font-semibold text-[#373737]">{initial}</span>
          )}
        </div>
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Welcome back, {displayName}!</h1>
          <p className="text-sm md:text-base text-[#373737]">Let’s get some reps in today.</p>
        </div>
      </div>
    </header>
  );
}
