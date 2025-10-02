// components/setup/setup-layout.tsx
'use client';

import * as React from 'react';

export default function SetupLayout({
  title = 'Setup',
  subtitle,
  children,
}: {
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  // Make THIS page the ONLY scroll container (match courses-layout behavior)
  React.useEffect(() => {
    document.documentElement.classList.add('overflow-hidden');
    document.body.classList.add('overflow-hidden');
    return () => {
      document.documentElement.classList.remove('overflow-hidden');
      document.body.classList.remove('overflow-hidden');
    };
  }, []);

  return (
    <div
      className={[
        // Fill the viewport and be the sole scroller
        'h-dvh',
        // No sidebar gutter rules here (as requested)
        'overflow-y-auto',
        // Theming consistent with courses-layout
        'bg-gradient-to-b from-[#f0f0f0] to-[#d2d2d2] text-[#0f0f0f]',
      ].join(' ')}
    >
      <div className="px-6 pt-8 pb-10 max-w-7xl mx-auto">
        <h1 className="text-3xl font-bold text-[#0f0f0f]">{title}</h1>
        <div className="mt-4 rounded-2xl overflow-hidden bg-[#eeeeee] border border-[#d7d7d7]">
          <div className="p-4 md:p-6">{children}</div>
        </div>
      </div>
    </div>
  );
}
