// components/vision/stage/stage-layout/StageCanvas.tsx
"use client";

import React, { forwardRef } from "react";

type Props = {
  className?: string;
  "aria-hidden"?: boolean | "true" | "false";
};

const StageCanvas = forwardRef<HTMLCanvasElement, Props>(function StageCanvas(
  { className, ...rest },
  ref
) {
  return (
    <canvas
      ref={ref}
      className={className ?? "absolute inset-0 w-full h-full pointer-events-none"}
      {...rest}
    />
  );
});

export default StageCanvas;
