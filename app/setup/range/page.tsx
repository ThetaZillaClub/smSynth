// app/setup/range/page.tsx
"use client";

import { Suspense, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import RangeSetup from "@/components/setup/range/RangeSetup";
import { primeAudioOnce } from "@/lib/training/primeAudio";

export default function RangeSetupPage() {
  // Suspense boundary must wrap the component that *uses* useSearchParams
  return (
    <Suspense fallback={null}>
      <PageInner />
    </Suspense>
  );
}

function PageInner() {
  const sp = useSearchParams();
  const studentId = sp.get("student_id") ?? null;

  // warm up audio/worklet once
  useEffect(() => {
    void primeAudioOnce();
  }, []);

  return <RangeSetup studentId={studentId} />;
}
