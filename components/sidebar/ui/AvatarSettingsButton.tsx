'use client';

import * as React from 'react';
import StudentImage from '@/components/student-home/StudentImage';
import { PR_COLORS } from '@/utils/stage/theme';

type Props = {
  displayName: string;
  imgUrl: string | null;
  onClick: () => void;
  collapsed: boolean;
  active?: boolean;
};

export default function AvatarSettingsButton({
  displayName,
  imgUrl,
  onClick,
  collapsed,
  active = false,
}: Props) {
  // Always inset so highlight never touches edges
  const outer = [
    'relative w-full select-none',
    'px-2', // keep inset in collapsed too
    'py-1',
    'focus-visible:outline-none',
  ].join(' ');

  const innerBase = [
    'relative flex items-stretch w-full',
    'rounded-xl',
    'text-[#0f0f0f]',
    'py-3',
    'transition-colors duration-150 ease-out',
  ].join(' ');

  const innerState = active
    ? 'bg-gradient-to-b from-[#f7f7f7] to-[#f6f6f6] shadow-sm'
    : 'hover:bg-[#f4f4f4] hover:shadow-sm';

  // FIX: lock rail to 48px; no transform, no animation, no nudge on active
  const col1 = [
    'w-12 min-w-[48px] max-w-[48px]',
    'shrink-0 grow-0 flex items-center justify-center',
  ].join(' ');

  const col2 = 'flex-1 flex items-center px-2 text-base font-medium';

  return (
    <button
      type="button"
      className={outer}
      onClick={onClick}
      title="Settings"
      aria-current={active ? 'page' : undefined}
    >
      <div className={[innerBase, innerState].join(' ')}>
        {/* Rail overlays only when active; no layout shift */}
        {active && (
          <div
            className="absolute left-0 top-0 bottom-0 w-1.5 rounded-l-xl"
            style={{ background: PR_COLORS.noteFill }}
            aria-hidden
          />
        )}

        <div className={col1}>
          <div className="w-6 h-6 rounded overflow-hidden">
            <StudentImage imgUrl={imgUrl} alt={displayName} visible />
          </div>
        </div>

        {!collapsed && <div className={col2}>{displayName}</div>}
      </div>
    </button>
  );
}
