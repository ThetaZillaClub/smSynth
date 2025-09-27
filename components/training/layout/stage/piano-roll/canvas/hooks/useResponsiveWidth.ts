// components/training/layout/stage/piano-roll/canvas/hooks/useResponsiveWidth.ts
"use client";

import { useLayoutEffect, useState } from "react";

/** Accepts any ref with a `current: Element | null` shape (avoids invariance issues). */
type AnyHostRef = { readonly current: Element | null };

export default function useResponsiveWidth(hostRef: AnyHostRef) {
  const [width, setWidth] = useState<number | null>(null);

  useLayoutEffect(() => {
    const el = hostRef.current as HTMLElement | null;
    if (!el) return;

    const measure = () => {
      const w = el.clientWidth || Math.round(el.getBoundingClientRect().width);
      if (w && w !== width) setWidth(w);
    };

    // initial + next-frame + resize observer
    measure();
    const raf = requestAnimationFrame(measure);
    const ro = new ResizeObserver(measure);
    ro.observe(el);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return width;
}
