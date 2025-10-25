'use client';

import * as React from 'react';
import { ChevronRightIcon } from '../svg/Icons';

type Props = {
  collapsed: boolean;
  onClick: () => void;
};

export default function CollapseToggleRow({ collapsed, onClick }: Props) {
  // Outer padding so the hover state is inset & rounded
  const outer = [
    'relative w-full select-none',
    'px-2 py-1',
    'focus-visible:outline-none',
  ].join(' ');

  const inner = [
    'relative flex items-stretch w-full',
    'rounded-xl',
    'text-[#0f0f0f]',
    'py-3',
    'transition-colors duration-150 ease-out',
    'hover:bg-[#f4f4f4] hover:shadow-sm',
  ].join(' ');

  return (
    <button
      type="button"
      onClick={onClick}
      className={outer}
      title="Collapse"
      aria-label="Collapse sidebar"
    >
      <div className={inner}>
        <div className="w-16 min-w-[64px] max-w-[64px] shrink-0 grow-0 flex items-center justify-center">
          <ChevronRightIcon />
        </div>
        {!collapsed && (
          <div className="flex-1 flex items-center text-base px-2 font-medium">
            Collapse
          </div>
        )}
      </div>
    </button>
  );
}
