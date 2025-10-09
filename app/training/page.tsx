// app/training/page.tsx
"use client";

import React, { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import CurriculumRouter from "@/components/game-navigation/CurriculumRouter";

export default function TrainingPage() {
  return (
    <Suspense fallback={null}>
      <TrainingPageInner />
    </Suspense>
  );
}

function TrainingPageInner() {
  const params = useSearchParams();
  const studentId = params?.get("student_id") ?? null;

  return <CurriculumRouter studentId={studentId} />;
}
