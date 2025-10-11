// components/training/layout/footer/meta/ScaleMeta.tsx
"use client";

import React from "react";
import MetaItem from "./MetaItem";
import { friendlyScaleLabel, type ScaleName } from "./scale";

export default function ScaleMeta({
  scaleName,
  keySig,
  className,
}: {
  scaleName?: ScaleName | null;
  keySig?: string | null;
  className?: string;
}) {
  const scaleText = friendlyScaleLabel(scaleName ?? null, keySig ?? null);
  return <MetaItem className={className} label="Scale" value={scaleText} />;
}
