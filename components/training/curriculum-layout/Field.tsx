// components/training/curriculum-layout/Field.tsx
"use client";
import React from "react";

export default function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1 mb-2">
      <div className="text-[11px] uppercase tracking-wide text-[#6b6b6b]">
        {label}
      </div>
      {children}
    </div>
  );
}
