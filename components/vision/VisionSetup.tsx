// components/vision/VisionSetup.tsx
"use client";

import React from "react";
import VisionStage from "./stage/VisionStage";

export default function VisionSetup() {
  return (
    <div className="min-h-dvh h-dvh flex flex-col bg-[#0b0b0b] text-white">
      {/* Simple header */}
      <div className="w-full px-6 py-3 bg-[#111111] border-b border-[#2a2a2a]">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-lg font-semibold">Vision Calibration</h1>
          <p className="text-xs text-white/70">
            Follow the 4-beat count-in, then conduct 16 upbeats on the metronome. We’ll auto-compute and save your gesture delay.
          </p>
        </div>
      </div>

      {/* Stage */}
      <div className="flex-1 min-h-0">
        <VisionStage />
      </div>
    </div>
  );
}
