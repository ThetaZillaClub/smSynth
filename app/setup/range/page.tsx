// app/setup/range/page.tsx
"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import RangeSetup from "@/components/setup/range/RangeSetup";
import { primeAudioOnce } from "@/lib/training/primeAudio";

export default function RangeSetupPage() {
  const sp = useSearchParams();
  const studentId = sp?.get("student_id") ?? null;

  // Kick off audio/worklet as the setup page opens
  useEffect(() => {
    void primeAudioOnce();
  }, []);

  return <RangeSetup studentId={studentId} />;
}
