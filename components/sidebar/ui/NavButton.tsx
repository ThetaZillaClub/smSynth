'use client';

import * as React from 'react';

type Props = {
  active: boolean;
  onClick?: () => void;
  icon: React.ReactNode;
  label: string;
  collapsed: boolean;
  locked?: boolean; // requireAuth && !authed (only set AFTER hydration)
};

export default function NavButton({ active, onClick, icon, label, collapsed, locked = false }: Props) {
  const baseRow = [
    'flex items-stretch w-full select-none transition',
    'hover:bg-[#e8e8e8] active:bg-[#e0e0e0]',
    'text-[#0f0f0f]',
    'py-3',
  ].join(' ');
  const col1 = 'w-16 min-w-[64px] max-w-[64px] shrink-0 grow-0 flex items-center justify-center';
  const col2 = 'flex-1 flex items-center px-3 text-base font-medium';

  // ✅ No `disabled` attr (boolean attr mismatch is a common hydration culprit).
  //    We use aria-disabled + class only (locked is false on SSR, set after hydration).
  const cls = [
    baseRow,
    active ? 'bg-[#eaeaea]' : '',
    locked ? 'opacity-60 cursor-not-allowed' : '',
  ].join(' ');

  return (
    <button
      type="button"
      onClick={onClick}
      aria-disabled={locked || undefined}
      className={cls}
    >
      <div className={col1} aria-hidden>{icon}</div>
      {!collapsed && <div className={col2}>{label}</div>}
    </button>
  );
}
