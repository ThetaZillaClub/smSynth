// components/sidebar/hooks/useCollapsed.ts
'use client';

import * as React from 'react';

type Width = string; // allow CSS vars, clamp(), etc.

export function useCSSSidebarWidth() {
  return React.useCallback((w: Width) => {
    try { document.documentElement.style.setProperty('--sidebar-w', w); } catch {}
  }, []);
}

/**
 * Always start NOT collapsed on load to avoid FOUC.
 * We do not read or persist to localStorage anymore.
 * Collapse state is ephemeral for the session.
 */
export function useCollapsed(initial = false) {
  const [collapsed, setCollapsed] = React.useState<boolean>(initial);

  const toggle = React.useCallback(() => {
    setCollapsed((c) => !c);
  }, []);

  return { collapsed, toggle };
}
