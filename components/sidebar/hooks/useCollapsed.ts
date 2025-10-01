'use client';

import * as React from 'react';
import { STORAGE_KEY } from '../types';

type Width = '0px' | '64px' | '240px';

export function useCSSSidebarWidth() {
  return React.useCallback((w: Width) => {
    try { document.documentElement.style.setProperty('--sidebar-w', w); } catch {}
  }, []);
}

export function useCollapsed(initial = false) {
  const [collapsed, setCollapsed] = React.useState(initial);

  React.useEffect(() => {
    try { setCollapsed(localStorage.getItem(STORAGE_KEY) === '1'); } catch { setCollapsed(false); }
  }, []);

  const toggle = React.useCallback(() => {
    setCollapsed((c) => {
      const next = !c;
      try { localStorage.setItem(STORAGE_KEY, next ? '1' : '0'); } catch {}
      return next;
    });
  }, []);

  return { collapsed, toggle };
}
