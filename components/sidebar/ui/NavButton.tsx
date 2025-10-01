'use client';

import * as React from 'react';

type Props = {
  active: boolean;
  disabled?: boolean;
  onClick?: () => void;
  icon: React.ReactNode;
  label: string;
  collapsed: boolean;
};

export default function NavButton({ active, disabled, onClick, icon, label, collapsed }: Props) {
  const baseRow = [
    'flex items-stretch w-full select-none transition',
    'hover:bg-[#e8e8e8] active:bg-[#e0e0e0]',
    'text-[#0f0f0f]',
    'py-3',
  ].join(' ');
  const col1 = 'w-16 min-w-[64px] max-w-[64px] shrink-0 grow-0 flex items-center justify-center';
  const col2 = 'flex-1 flex items-center px-3 text-base font-medium';

  return (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      className={[
        baseRow,
        active ? 'bg-[#eaeaea]' : '',
        disabled ? 'opacity-60 cursor-not-allowed' : '',
      ].join(' ')}
    >
      <div className={col1} aria-hidden>{icon}</div>
      {!collapsed && <div className={col2}>{label}</div>}
    </button>
  );
}
