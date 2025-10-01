// components/sidebar/AuthAwareShell.tsx
'use client';

import * as React from 'react';
import { usePathname } from 'next/navigation';
import Sidebar from './Sidebar';

type Props = { children: React.ReactNode };

export default function AuthAwareShell({ children }: Props) {
  const pathname = usePathname() || '/';
  const isAuthRoute = pathname.startsWith('/auth');

  // Make sure the CSS var is 0 on auth pages (no left gutter).
  React.useEffect(() => {
    try {
      if (isAuthRoute) document.documentElement.style.setProperty('--sidebar-w', '0px');
    } catch {}
  }, [isAuthRoute]);

  if (isAuthRoute) {
    // No grid, no sidebar — just render the page.
    return <main className="min-h-screen">{children}</main>;
  }

  // App shell (grid + sidebar) for everything else.
  return (
    <div
      id="app-shell"
      className="grid min-h-screen transition-[grid-template-columns] duration-200 ease-out"
      style={{ gridTemplateColumns: 'var(--sidebar-w) 1fr' }}
    >
      <Sidebar />
      <main className="min-h-screen">{children}</main>
    </div>
  );
}
