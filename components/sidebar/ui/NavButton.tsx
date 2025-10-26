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

export default function NavButton({
  active,
  onClick,
  icon,
  label,
  collapsed,
  locked = false,
}: Props) {
  // Always inset so highlight never touches edges
  const outer = [
    'relative w-full select-none',
    'px-2', // keep inset even when collapsed
    'py-1',
    'focus-visible:outline-none',
    locked ? 'opacity-60 cursor-not-allowed' : '',
  ].join(' ');

  // Inner highlight surface
  const innerBase = [
    'relative flex items-stretch w-full',
    'rounded-xl',
    'text-[#0f0f0f]',
    'py-3' ,
    'transition-colors duration-150 ease-out',
  ].join(' ');

  const innerState = active
    ? 'bg-gradient-to-b from-[#f7f7f7] to-[#f6f6f6] shadow-sm'
    : (locked ? '' : 'hover:bg-[#f4f4f4] hover:shadow-sm');

  // FIX: lock rail to 48px; no transform, no animation, no nudge on active
  const col1 = [
    'w-12 min-w-[48px] max-w-[48px]',
    'shrink-0 grow-0 flex items-center justify-center',
  ].join(' ');

  const col2 = 'flex-1 flex items-center text-base pl-3 font-medium';

  return (
    <button
      type="button"
      onClick={onClick}
      aria-disabled={locked || undefined}
      aria-current={active ? 'page' : undefined}
      className={outer}
    >
      <div className={[innerBase, innerState].join(' ')}>
        {/* Green rail overlays only when active; does NOT affect layout */}
        {active && (
          <div
            className="absolute left-0 top-0 bottom-0 w-1.5 rounded-l-xl"
            style={{ background: PR_COLORS.noteFill }}
            aria-hidden
          />
        )}

        <div className={col1} aria-hidden>
          {icon}
        </div>

        {!collapsed && <div className={col2}>{label}</div>}
      </div>
    </button>
  );
}
