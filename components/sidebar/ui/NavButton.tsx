'use client';

import * as React from 'react';
import { PR_COLORS } from '@/utils/stage/theme'; // same green as InProgressCard

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
    'relative flex items-stretch w-full select-none',
    'text-[#0f0f0f]',
    'py-3',
    'focus-visible:outline-none', // no black outline
    'transition-colors duration-150 ease-out', // limit to color-only to avoid FOUC-y pops
  ].join(' ');

  const col1 = 'w-16 min-w-[64px] max-w-[64px] shrink-0 grow-0 flex items-center justify-center';
  const col2 = 'flex-1 flex items-center text-base px-2 font-medium';

  // Only two visual states:
  // - active (route matches): gradient + subtle shadow
  // - idle w/ hover: solid mid tone (#f4f4f4), no :active styling
  const stateRow = active
    ? 'bg-gradient-to-b from-[#f8f8f8] to-[#f7f7f7] shadow-sm'
    : (locked ? '' : 'hover:bg-[#f5f5f5] hover:shadow-sm');

  const cls = [
    baseRow,
    stateRow,
    locked ? 'opacity-60 cursor-not-allowed' : '',
  ].join(' ');

  return (
    <button
      type="button"
      onClick={onClick}
      aria-disabled={locked || undefined}
      aria-current={active ? 'page' : undefined}
      className={cls}
    >
      {/* left green rail for active item */}
      <div
        className="absolute left-0 top-0 bottom-0 w-1.5"
        style={{ background: active ? PR_COLORS.noteFill : 'transparent' }}
        aria-hidden
      />
      <div className={col1} aria-hidden>{icon}</div>
      {!collapsed && <div className={col2}>{label}</div>}
    </button>
  );
}
