'use client';

import * as React from 'react';

export type HomeBootstrap = {
  uid: string;
  // add more shared bits later if needed:
  // displayName?: string;
  // studentImagePath?: string | null;
};

const Ctx = React.createContext<HomeBootstrap | null>(null);

export function HomeBootstrapProvider({
  value,
  children,
}: {
  value: HomeBootstrap;
  children: React.ReactNode;
}) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useHomeBootstrap(): HomeBootstrap {
  const ctx = React.useContext(Ctx);
  if (!ctx) throw new Error('useHomeBootstrap must be used within HomeBootstrapProvider');
  return ctx;
}
