// components/vision/VisionSetup.tsx
"use client";

import React from "react";
import VisionStage from "./stage/VisionStage";

export default function VisionSetup() {
  return (
    <div className="min-h-dvh h-dvh flex flex-col bg-gradient-to-b from-[#f0f0f0] to-[#d2d2d2] text-[#0f0f0f]">
      {/* No header — footer provides controls and status */}
      <div className="flex-1 min-h-0">
        <VisionStage />
      </div>
    </div>
  );
}
