'use client';

import * as React from 'react';
import { ChevronRightIcon } from '../svg/Icons';

type Props = {
  collapsed: boolean;
  onClick: () => void;
};

export default function CollapseToggleRow({ collapsed, onClick }: Props) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'relative flex items-stretch w-full select-none',
        'text-[#0f0f0f]',
        'py-3',
        'focus-visible:outline-none',
        'transition-colors duration-150 ease-out',
        // hover only; no :active styling to avoid flash
        'hover:bg-[#f5f5f5] hover:shadow-sm',
      ].join(' ')}
      title="Collapse"
      aria-label="Collapse sidebar"
    >
      <div className="w-16 min-w-[64px] max-w-[64px] shrink-0 grow-0 flex items-center justify-center">
        <ChevronRightIcon />
      </div>
      {!collapsed && (
        <div className="flex-1 flex items-center text-base px-2 font-medium">
          Collapse
        </div>
      )}
    </button>
  );
}
