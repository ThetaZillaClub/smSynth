// components/model-library/LibraryGrid.tsx
'use client';

import Link from 'next/link';
import LibraryCard from '@/components/model-library/LibraryCard';
import type { LibraryModel } from './Library';

export default function LibraryGrid({ models }: { models: LibraryModel[] }) {
  if (!models.length) {
    return (
      <div className="text-center text-[#373737] max-w-md mx-auto">
        No public models yet.
      </div>
    );
  }

  return (
    <div className="flex flex-wrap justify-center gap-8 max-w-4xl mx-auto">
      {models.map((m) => (
        <Link
          key={m.id}
          href={`/model/${m.id}`}
          className="flex flex-col items-center bg-[#ebebeb] border border-[#d2d2d2] rounded-lg shadow-md hover:shadow-lg transition-shadow basis-[calc(50%-1rem)] max-w-[calc(50%-1rem)] sm:max-w-none"
        >
          <LibraryCard model={m} />
        </Link>
      ))}
    </div>
  );
}
