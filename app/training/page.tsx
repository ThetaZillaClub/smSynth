// app/training/page.tsx
"use client";

import React from "react";
import { useSearchParams } from "next/navigation";
import CurriculumRouter from "@/components/game-navigation/CurriculumRouter";

export default function TrainingPage() {
  const params = useSearchParams();
  const modelId = params.get("model_id");

  return <CurriculumRouter studentId={modelId} />;
}
