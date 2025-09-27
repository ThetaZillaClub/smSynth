// components/vision/stage/hooks/useCanvasSizer.ts
"use client";

import { useCallback, useEffect } from "react";

/**
 * Keeps a canvas matched to its wrapper size with DPR scaling.
 */
export default function useCanvasSizer(
  wrapRef: React.RefObject<HTMLDivElement | null>,
  canvasRef: React.RefObject<HTMLCanvasElement | null>,
  opts: { maxDpr?: number } = {}
) {
  const { maxDpr = 2 } = opts;

  const resizeCanvasToWrapper = useCallback(() => {
    const wrap = wrapRef.current,
      canvas = canvasRef.current;
    if (!wrap || !canvas) return;
    const dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, maxDpr));
    const { width, height } = wrap.getBoundingClientRect();
    canvas.width = Math.max(1, Math.round(width * dpr));
    canvas.height = Math.max(1, Math.round(height * dpr));
    canvas.style.width = `${Math.round(width)}px`;
    canvas.style.height = `${Math.round(height)}px`;
    const g = canvas.getContext("2d");
    if (g) g.setTransform(dpr, 0, 0, dpr, 0, 0);
  }, [wrapRef, canvasRef, maxDpr]);

  useEffect(() => {
    resizeCanvasToWrapper();
    const onResize = () => resizeCanvasToWrapper();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [resizeCanvasToWrapper]);
}
