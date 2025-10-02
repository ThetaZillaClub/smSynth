// components/training/layout/stage/side-panel/sidepanellayout.tsx
"use client";

import * as React from "react";

/**
 * SidePanelLayout
 *
 * A vertical card that matches the Courses card aesthetic (rounded, light gray, subtle border).
 * It fills the available height, keeps its own scroll, and always shows a footer button.
 *
 * - Pass the review/pretest UI as children.
 * - Provide a footerButton to render a single primary CTA on the panel.
 * - When children are empty, a light placeholder is shown so the panel never "vanishes".
 */
export default function SidePanelLayout({
  children,
  footerButton,
  placeholder = (
    <div className="text-sm text-[#373737]">
      Practice in progress. Your pretest and take reviews will appear here.
    </div>
  ),
}: {
  children?: React.ReactNode;
  placeholder?: React.ReactNode;
  footerButton: {
    label: string;
    onClick: () => void | Promise<void>;
    title?: string;
    disabled?: boolean;
  };
}) {
  return (
    <div
      className={[
        "h-full rounded-xl bg-[#f2f2f2] border border-[#dcdcdc]",
        "shadow-sm p-3 md:p-4 flex flex-col",
      ].join(" ")}
    >
      {/* Content area */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {hasRenderableChildren(children) ? children : placeholder}
      </div>

      {/* Footer button (always visible) */}
      <div className="pt-3 mt-3 border-t border-[#e6e6e6] flex justify-end">
        <button
          type="button"
          title={footerButton.title || footerButton.label}
          disabled={!!footerButton.disabled}
          onClick={footerButton.onClick}
          className={[
            "px-3 py-1.5 rounded-md border border-[#d2d2d2]",
            "bg-[#0f0f0f] text-[#f0f0f0] text-sm",
            "hover:opacity-90 disabled:opacity-50 transition",
            "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0f0f0f]",
          ].join(" ")}
        >
          {footerButton.label}
        </button>
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
