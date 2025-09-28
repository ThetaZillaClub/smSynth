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

  // draw rhythm blocks (note = blue rect, rest = gap)
  const visLeft = -32,
    visRight = width + 32;
  const padY = 6;
  const laneY = padY;
  const laneH = Math.max(8, height - padY * 2);

  const sixteenthPx = Math.max(0, sixteenthSec * pxPerSec);

  for (const seg of items) {
    if (!seg.isNote) continue;

    const x = anchorX + (seg.t0 - tView) * pxPerSec;
    const noteDurSec = seg.t1 - seg.t0;
    const w = Math.max(1, noteDurSec * pxPerSec);
    if (x + w < visLeft || x > visRight) continue;

    const rx = Math.round(x);
    const ry = Math.round(laneY);
    const rh = Math.round(laneH);
    const rw = Math.round(w);

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

  // playhead dot (always visible)
  const DOT_R = 6;
  const xGuide = anchorX;
  const yCenter = laneY + laneH / 2;
  ctx.fillStyle = PR_COLORS.dotFill;
  ctx.beginPath();
  ctx.arc(xGuide, yCenter, DOT_R, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = 1.25;
  ctx.strokeStyle = PR_COLORS.dotStroke;
  ctx.stroke();

  // container border only
  ctx.strokeStyle = PR_COLORS.gridMajor;
  ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, width - 1, height - 1);
}
