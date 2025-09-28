export function computeAnchorAndScale(width: number, windowSec: number, anchorRatio: number) {
  const anchorX = Math.max(0, Math.min(width * anchorRatio, width - 1));
  const pxPerSec = (width - anchorX) / Math.max(0.001, windowSec);
  return { anchorX, pxPerSec };
}
