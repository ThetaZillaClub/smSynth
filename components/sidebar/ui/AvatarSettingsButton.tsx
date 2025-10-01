'use client';

import * as React from 'react';
import StudentImage from '@/components/student-home/StudentImage';

type Props = {
  displayName: string;
  imgUrl: string | null;
  onClick: () => void;
  collapsed: boolean;
};

export default function AvatarSettingsButton({ displayName, imgUrl, onClick, collapsed }: Props) {
  const baseRow = [
    'flex items-stretch w-full select-none transition',
    'hover:bg-[#e8e8e8] active:bg-[#e0e0e0]',
    'text-[#0f0f0f]',
    'py-3',
  ].join(' ');
  const col1 = 'w-16 min-w-[64px] max-w-[64px] shrink-0 grow-0 flex items-center justify-center';
  const col2 = 'flex-1 flex items-center px-3 text-base font-medium';

  return (
    <button type="button" className={baseRow} onClick={onClick} title="Settings">
      <div className={col1}>
        <div className="w-6 h-6 rounded overflow-hidden">
          <StudentImage imgUrl={imgUrl} alt={displayName} visible />
        </div>
      </div>
      {!collapsed && <div className={col2}>{displayName}</div>}
    </button>
  );
}
