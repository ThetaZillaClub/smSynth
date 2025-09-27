// components/vision/stage/stage-layout/StageCamera.tsx
"use client";

import React, { forwardRef } from "react";

type Props = {
  className?: string;
  "aria-label"?: string;
};

const StageCamera = forwardRef<HTMLVideoElement, Props>(function StageCamera(
  { className, ...rest },
  ref
) {
  return (
    <video
      ref={ref}
      playsInline
      muted
      autoPlay
      className={className ?? "absolute inset-0 w-full h-full object-contain bg-black"}
      {...rest}
    />
  );
});

export default StageCamera;
