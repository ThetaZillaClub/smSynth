// components/sidebar/AuthAwareShell.tsx
'use client';

import * as React from 'react';
import { usePathname } from 'next/navigation';
import Sidebar from './Sidebar';

type Props = { children: React.ReactNode };

export default function AuthAwareShell({ children }: Props) {
  const pathname = usePathname() || '/';
  const isAuthRoute = pathname.startsWith('/auth');
  const [ready, setReady] = React.useState(false);

  // Make sure the CSS var is 0 on auth pages (no left gutter).
  React.useEffect(() => {
    try {
      if (isAuthRoute) document.documentElement.style.setProperty('--sidebar-w', '0px');
    } catch {}
    // Enable grid transition only after first client paint to avoid initial FOUC
    setReady(true);
  }, [isAuthRoute]);

  if (isAuthRoute) {
    // No grid, no sidebar — just render the page.
    return <main className="min-h-screen">{children}</main>;
  }

  // App shell (grid + sidebar) for everything else.
  return (
    <div
      id="app-shell"
      className={['grid min-h-screen', ready ? 'transition-[grid-template-columns] duration-200 ease-out' : ''].join(' ')}
      style={{ gridTemplateColumns: 'var(--sidebar-w) 1fr' }}
    >
      <Sidebar />
      <main className="min-h-screen">{children}</main>
    </div>
  );
}
