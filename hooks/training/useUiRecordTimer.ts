// hooks/training/useUiRecordTimer.ts
"use client";

import { useEffect, useState } from "react";

export default function useUiRecordTimer(isRecording: boolean, anchorMs: number | null) {
  const [sec, setSec] = useState(0);

  useEffect(() => {
    let raf: number | null = null;
    const tick = () => {
      if (isRecording && anchorMs != null) {
        const t = (performance.now() - anchorMs) / 1000;
        setSec(t);
        raf = requestAnimationFrame(tick);
      }
    };
    if (isRecording && anchorMs != null) {
      raf = requestAnimationFrame(tick);
    } else {
      setSec(0);
    }
    return () => { if (raf) cancelAnimationFrame(raf); };
  }, [isRecording, anchorMs]);

  return sec;
}
