'use client';

import * as React from 'react';

export function useMeasure() {
  const ref = React.useRef<HTMLDivElement | null>(null);
  const [w, setW] = React.useState(0);

  React.useLayoutEffect(() => {
    const el = ref.current; if (!el) return;

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
    window.addEventListener('radials-tab-shown' as any, onTabShown as any);
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      ro.disconnect();
      window.removeEventListener('resize', onResize);
      window.removeEventListener('radials-tab-shown' as any, onTabShown as any);
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
    const h = () => setDpr(window.devicePixelRatio || 1);
    window.addEventListener('resize', h);
    // Also react when tabs reveal/hide canvases
    const h2 = () => setDpr(window.devicePixelRatio || 1);
    window.addEventListener('radials-tab-shown' as any, h2 as any);
    return () => {
      window.removeEventListener('resize', h);
      window.removeEventListener('radials-tab-shown' as any, h2 as any);
    };
  }, []);
  return dpr;
}

export function useCanvas2d(width: number, height: number) {
  const ref = React.useRef<HTMLCanvasElement | null>(null);
  const dpr = useDpr();

  React.useLayoutEffect(() => {
    const c = ref.current; if (!c) return;
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
