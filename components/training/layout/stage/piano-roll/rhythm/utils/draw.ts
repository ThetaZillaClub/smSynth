import { PR_COLORS } from "@/utils/stage";

const BLUE = { fill: "#3b82f6" }; // blue-500
const BLUE_TAIL = "rgba(59,130,246,0.25)";

type Item = { t0: number; t1: number; isNote: boolean };

export function drawAll({
  ctx,
  width,
  height,
  anchorX,
  pxPerSec,
  tView,
  items,
  sixteenthSec,
}: {
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  anchorX: number;
  pxPerSec: number;
  tView: number;
  items: Item[];
  sixteenthSec: number;
}) {
  // background
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = PR_COLORS.bg;
  ctx.fillRect(0, 0, width, height);

  const visLeft = -32,
    visRight = width + 32;
  const padY = 6;
  const laneY = padY;
  const laneH = Math.max(8, height - padY * 2);

  const sixteenthPx = Math.max(0, sixteenthSec * pxPerSec);

  // same rounding model as the piano roll
  const baseX = Math.round(anchorX - tView * pxPerSec);

  for (const seg of items) {
    if (!seg.isNote) continue;

    const rx = baseX + Math.round(seg.t0 * pxPerSec);
    const noteDurSec = seg.t1 - seg.t0;
    const rw = Math.max(1, Math.round(noteDurSec * pxPerSec));
    if (rx + rw < visLeft || rx > visRight) continue;

    const ry = Math.round(laneY);
    const rh = Math.round(laneH);

    if (noteDurSec < sixteenthSec - 1e-6) {
      ctx.fillStyle = BLUE.fill;
      ctx.fillRect(rx, ry, rw, rh);
      continue;
    }

    const leadW = Math.max(1, Math.min(rw, Math.round(sixteenthPx)));
    const tailW = rw - leadW;

    const grad = ctx.createLinearGradient(rx, 0, rx + leadW, 0);
    grad.addColorStop(0, BLUE.fill);
    grad.addColorStop(1, BLUE_TAIL);
    ctx.fillStyle = grad;
    ctx.fillRect(rx, ry, leadW, rh);

    if (tailW > 0) {
      ctx.fillStyle = BLUE_TAIL;
      ctx.fillRect(rx + leadW, ry, tailW, rh);
    }
  }

  // playhead dot (crisp, matches piano)
  const DOT_R = 6;
  const xGuide = Math.round(anchorX) + 0.5;
  const yCenter = laneY + laneH / 2;
  ctx.fillStyle = PR_COLORS.dotFill;
  ctx.beginPath();
  ctx.arc(xGuide, yCenter, DOT_R, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = 1.25;
  ctx.strokeStyle = PR_COLORS.dotStroke;
  ctx.stroke();

}
