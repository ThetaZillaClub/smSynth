import { PR_COLORS } from "@/utils/stage";

export function ensureCanvas2d(
  cnv: HTMLCanvasElement,
  width: number,
  height: number,
  dpr: number
): CanvasRenderingContext2D | null {
  const wantW = Math.round(width * dpr);
  const wantH = Math.round(height * dpr);
  if (cnv.width !== wantW) cnv.width = wantW;
  if (cnv.height !== wantH) cnv.height = wantH;
  const ctx = cnv.getContext("2d");
  if (!ctx) return null;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return ctx;
}
