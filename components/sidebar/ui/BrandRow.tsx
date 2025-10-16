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
    'flex items-stretch w-full select-none transition',
    'hover:bg-[#e8e8e8] active:bg-[#e0e0e0]',
    'text-[#0f0f0f]',
    'py-3',
  ].join(' ');
  const col1 = 'w-16 min-w-[64px] max-w-[64px] shrink-0 grow-0 flex items-center justify-center';
  const col2 = 'flex-1 flex items-center px-3 text-base font-medium';

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
      {/* Make the brand mark the largest icon in the rail. */}
      <div className={col1}>
        <Logo
          style={{
            // Brand icon intentionally larger than 32px nav icons.
            // Override via :root { --brand-icon: 52px; } if you want it even bigger.
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
