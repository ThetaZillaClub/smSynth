'use client';

import * as React from 'react';
import Link from 'next/link';
import Logo from '@/components/header/Logo';

export default function BrandRow({
  authed,
  collapsed,
  brand,
  goCourses,
}: {
  authed: boolean;
  collapsed: boolean;
  brand: string;
  goCourses: () => void;
}) {
  const baseRow = [
    'flex items-stretch w-full select-none transition',
    'hover:bg-[#e8e8e8] active:bg-[#e0e0e0]',
    'text-[#0f0f0f]',
    'py-3',
  ].join(' ');
  const col1 = 'w-16 min-w-[64px] max-w-[64px] shrink-0 grow-0 flex items-center justify-center';
  const col2 = 'flex-1 flex items-center px-3 text-base font-medium';

  return (
    <Link
      href={authed ? '/courses' : '/'}
      prefetch={false}
      className={baseRow}
      onClick={(e) => {
        if (authed) {
          e.preventDefault();
          goCourses();
        }
      }}
    >
      <div className={col1}><Logo className="w-6 h-6" /></div>
      {!collapsed && <div className={col2}>{brand}</div>}
    </Link>
  );
}
