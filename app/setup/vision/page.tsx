// app/setup/vision/page.tsx
"use client";

import dynamic from "next/dynamic";
const VisionSetup = dynamic(() => import("@/components/setup/vision/VisionSetup"), { ssr: false });

export default function VisionSetupPage() {
  return <VisionSetup />;
}
