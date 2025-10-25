'use client';

import * as React from 'react';
import Link from 'next/link';
import Logo from '@/components/auth/Logo';

export default function BrandRow({
  authed,
  collapsed,
  brand,
  goHome,
}: {
  authed: boolean;
  collapsed: boolean;
  brand: string;
  goHome: () => void;
}) {
  const baseRow = [
    'relative flex items-stretch w-full select-none transition',
    'text-[#0f0f0f]',
    'py-3',
    'focus-visible:outline-none' // remove black focus stroke
  ].join(' ');

  const col1 = 'w-16 min-w-[64px] max-w-[64px] shrink-0 grow-0 flex items-center justify-center';
  // Slightly larger + heavier brand text
  const col2 = 'flex-1 flex items-center px-2 text-lg font-semibold tracking-tight';

  return (
    <Link
      href="/"
      prefetch={false}
      className={baseRow}
      onClick={(e) => {
        if (authed) {
          e.preventDefault();
          goHome();
        }
      }}
    >
      <div className={col1}>
        <Logo
          style={{
            width: 'var(--brand-icon, 48px)',
            height: 'var(--brand-icon, 48px)',
            display: 'block',
          }}
        />
      </div>
      {!collapsed && <div className={col2}>{brand}</div>}
    </Link>
  );
}
