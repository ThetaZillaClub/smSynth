// app/training/page.tsx
"use client";

import React from "react";
import { useSearchParams } from "next/navigation";
import CurriculumRouter from "@/components/game-navigation/CurriculumRouter";

export default function TrainingPage() {
  const params = useSearchParams();
  const studentId = params.get("student_id"); // ← only the new param

  return <CurriculumRouter studentId={studentId} />;
}
