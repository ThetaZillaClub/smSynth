// components/training/layout/sheet/vexscore/useResizeObserver.ts
import { useEffect, useState } from "react";

export function useResizeObserver(
  ref: React.RefObject<HTMLElement>,
  minH = 120,
  fixedH?: number
) {
  const [dims, setDims] = useState<{ w: number; h: number }>({ w: 0, h: fixedH ?? minH });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const w = Math.max(1, el.clientWidth || Math.round(el.getBoundingClientRect().width));
      const h = fixedH ?? Math.max(minH, el.clientHeight || Math.round(el.getBoundingClientRect().height) || minH);
      setDims((p) => (p.w !== w || p.h !== h ? { w, h } : p));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref, fixedH, minH]);

  return dims;
}
