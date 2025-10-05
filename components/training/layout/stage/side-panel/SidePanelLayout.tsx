// components/training/layout/stage/side-panel/sidepanellayout.tsx
"use client";

import * as React from "react";

/**
 * SidePanelLayout
 *
 * A vertical card that matches the Courses card aesthetic (rounded, light gray, subtle border).
 * It fills the available height and keeps its own scroll.
 *
 * - Pass the review/pretest UI as children.
 * - When children are empty, a light placeholder is shown so the panel never "vanishes".
 */
export default function SidePanelLayout({
  children,
  placeholder = (
    <div className="text-sm text-[#373737]">
      Practice in progress. Your pretest and take reviews will appear here.
    </div>
  ),
}: {
  children?: React.ReactNode;
  placeholder?: React.ReactNode;
}) {
  return (
    <div
      className={[
        "h-full rounded-xl bg-[#eeeeee] border border-[#dcdcdc]",
        "shadow-sm p-3 md:p-4 flex flex-col",
      ].join(" ")}
    >
      {/* Content area */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {hasRenderableChildren(children) ? children : placeholder}
      </div>
    </div>
  );
}

function hasRenderableChildren(children: React.ReactNode) {
  if (children === null || children === undefined) return false;
  if (Array.isArray(children)) return children.some(Boolean);
  if (typeof children === "string") return children.trim().length > 0;
  return true;
}
