// app/setup/page.tsx
"use client";

import * as React from "react";
import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { primeAudioOnce } from "@/lib/training/primeAudio";
import SetupLayout from "@/components/setup/setup-layout";
import AllSetupCard from "@/components/setup/card";

export default function SetupPage() {
  // Wrap the hook user in Suspense to avoid the CSR bailout warning
  return (
    <SetupLayout title="Setup">
      <Suspense fallback={null}>
        <SetupInner />
      </Suspense>
    </SetupLayout>
  );
}

function SetupInner() {
  const router = useRouter();
  const sp = useSearchParams();
  const qs = sp?.toString() ?? "";

  const go = (href: string) => router.push(qs ? `${href}?${qs}` : href);

  const goRange = async () => {
    // Gesture-gated priming before routing
    await primeAudioOnce();
    go("/setup/range");
  };

  const items = [
    {
      key: "range",
      title: "Range",
      subtitle: "One-time voice range capture",
      onClick: goRange,
    },
    {
      key: "vision",
      title: "Vision",
      subtitle: "Camera + hand-beat calibration",
      onClick: () => go("/setup/vision"),
    },
  ];

  return <AllSetupCard items={items} />;
}
