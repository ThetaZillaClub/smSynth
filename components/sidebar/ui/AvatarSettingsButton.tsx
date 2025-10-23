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
  const baseRow = [
    'relative flex items-stretch w-full select-none',
    'text-[#0f0f0f]',
    'py-3',
    'focus-visible:outline-none', // remove black focus stroke
    'transition-colors duration-150 ease-out',
  ].join(' ');

  const col1 =
    'w-16 min-w-[64px] max-w-[64px] shrink-0 grow-0 flex items-center justify-center';
  const col2 = 'flex-1 flex items-center text-base font-medium';

  const stateRow = active
    ? 'bg-gradient-to-b from-[#f8f8f8] to-[#f7f7f7] shadow-sm'
    : 'hover:bg-[#f5f5f5] hover:shadow-sm'; // no :active

  const cls = [baseRow, stateRow].join(' ');

  return (
    <button
      type="button"
      className={cls}
      onClick={onClick}
      title="Settings"
      aria-current={active ? 'page' : undefined}
    >
      {/* left green rail when active */}
      <div
        className="absolute left-0 top-0 bottom-0 w-1.5"
        style={{ background: active ? PR_COLORS.noteFill : 'transparent' }}
        aria-hidden
      />
      <div className={col1}>
        <div className="w-6 h-6 rounded overflow-hidden">
          <StudentImage imgUrl={imgUrl} alt={displayName} visible />
        </div>
      </div>
      {!collapsed && <div className={col2}>{displayName}</div>}
    </button>
  );
}
