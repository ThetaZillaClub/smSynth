// components/home/statsbento/pitch/hooks.ts
'use client';

import * as React from 'react';

// Extend the DOM typing for our custom event fired by RadialsTabsCard
declare global {
  interface WindowEventMap {
    'radials-tab-shown': CustomEvent<{ tab: 'pitch' | 'intervals' }>;
  }
}

export function useMeasure() {
  const ref = React.useRef<HTMLDivElement | null>(null);
  const [w, setW] = React.useState(0);

  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    const pump = () => setW(el.clientWidth || 0);

    const ro = new ResizeObserver(pump);
    ro.observe(el);

    // Initial and defensive re-measures for cases RO can miss
    pump();
    const onResize = () => pump();
    const onTabShown = () => pump();
    const onVisibility = () => pump();

    window.addEventListener('resize', onResize);
    // Custom event fired by RadialsTabsCard
    window.addEventListener('radials-tab-shown', onTabShown);
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      ro.disconnect();
      window.removeEventListener('resize', onResize);
      window.removeEventListener('radials-tab-shown', onTabShown);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  return { ref, width: w };
}

export function useDpr() {
  const [dpr, setDpr] = React.useState(
    typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1
  );

  React.useEffect(() => {
    const onResize = () => setDpr(window.devicePixelRatio || 1);
    // Also react when tabs reveal/hide canvases
    const onTabShown = () => setDpr(window.devicePixelRatio || 1);

    window.addEventListener('resize', onResize);
    window.addEventListener('radials-tab-shown', onTabShown);

    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('radials-tab-shown', onTabShown);
    };
  }, []);

  return dpr;
}

export function useCanvas2d(width: number, height: number) {
  const ref = React.useRef<HTMLCanvasElement | null>(null);
  const dpr = useDpr();

  React.useLayoutEffect(() => {
    const c = ref.current;
    if (!c) return;

    const W = Math.max(1, Math.floor(width));
    const H = Math.max(1, Math.floor(height));

    // Keep backing store in sync with CSS pixels * DPR
    const needW = Math.round(W * dpr);
    const needH = Math.round(H * dpr);
    if (c.width !== needW || c.height !== needH) {
      c.width = needW;
      c.height = needH;
    }

    const ctx = c.getContext('2d');
    if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }, [width, height, dpr]);

  return { ref, dpr };
}
