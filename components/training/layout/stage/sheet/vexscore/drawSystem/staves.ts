import { Stave, StaveConnector, Barline } from "vexflow";
import { STAFF_GAP_Y } from "../layout";

export function createStaves(args: {
  ctx: any;
  padding: { left: number; right: number };
  currentY: number;
  staffWidth: number;
  tsNum: number;
  den: number;
  clef: "treble" | "bass";
  haveRhythm: boolean;
  keySig?: string | null;
  isLastSystem: boolean;
}) {
  const { ctx, padding, currentY, staffWidth, tsNum, den, clef, haveRhythm, keySig, isLastSystem } = args;

  const melStave = new Stave(padding.left, currentY, staffWidth);
  melStave.setClef(clef);
  melStave.setBegBarType(Barline.type.NONE);
  if (keySig) melStave.addKeySignature(keySig);
  melStave.addTimeSignature(`${tsNum}/${den}`);
  melStave.setEndBarType(isLastSystem ? Barline.type.END : Barline.type.SINGLE);
  melStave.setContext(ctx).draw();

  let rhyStave: Stave | null = null;
  if (haveRhythm) {
    const yR = melStave.getBottomY() + STAFF_GAP_Y;
    rhyStave = new Stave(padding.left, yR, staffWidth);
    rhyStave.setClef("bass");
    rhyStave.setBegBarType(Barline.type.NONE);
    if (keySig) rhyStave.addKeySignature(keySig);
    rhyStave.addTimeSignature(`${tsNum}/${den}`);
    rhyStave.setEndBarType(isLastSystem ? Barline.type.END : Barline.type.SINGLE);
    rhyStave.setContext(ctx).draw();

    new StaveConnector(melStave, rhyStave).setType(StaveConnector.type.BRACE).setContext(ctx).draw();
    new StaveConnector(melStave, rhyStave).setType(StaveConnector.type.SINGLE_LEFT).setContext(ctx).draw();
    new StaveConnector(melStave, rhyStave)
      .setType(isLastSystem ? StaveConnector.type.BOLD_DOUBLE_RIGHT : StaveConnector.type.SINGLE_RIGHT)
      .setContext(ctx)
      .draw();
  }

  return { melStave, rhyStave };
}
