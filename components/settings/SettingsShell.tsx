// components/settings/SettingsShell.tsx
"use client";

import * as React from "react";
import ProfileLayout from "./profile/profile-layout";
type Bootstrap = {
  uid: string;
  displayName: string;
  avatarPath: string | null;
  studentImagePath: string | null;
};
type RowKey =
  | "profile"
  | "audio"
  | "vision"
  | "gameplay"
  | "account"
  | "membership";

type Row = { key: RowKey; label: string; icon: React.ReactNode };

const ROWS: Row[] = [
  {
    key: "profile",
    label: "Profile",
    icon: (
      <svg viewBox="0 0 24 24" className="w-6 h-6" aria-hidden>
        <path
          d="M12 12a5 5 0 100-10 5 5 0 000 10zm0 2c-5 0-9 2.69-9 6v2h18v-2c0-3.31-4-6-9-6z"
          fill="currentColor"
        />
      </svg>
    ),
  },
  {
    key: "audio",
    label: "Audio",
    icon: (
      <svg viewBox="0 0 24 24" className="w-6 h-6" aria-hidden>
        <path
          d="M3 10v4h4l5 5V5L7 10H3zm14.5 2a3.5 3.5 0 01-2.5 3.35v-6.7A3.5 3.5 0 0117.5 12zm0-7a7 7 0 00-3.5 13.1v2.4a9.5 9.5 0 010-31.0z"
          fill="currentColor"
        />
      </svg>
    ),
  },
  {
    key: "vision",
    label: "Vision",
    icon: (
      <svg viewBox="0 0 24 24" className="w-6 h-6" aria-hidden>
        <path
          d="M12 5C7 5 2.73 8.11 1 12c1.73 3.89 6 7 11 7s9.27-3.11 11-7c-1.73-3.89-6-7-11-7zm0 12a5 5 0 110-10 5 5 0 010 10z"
          fill="currentColor"
        />
      </svg>
    ),
  },
  {
    key: "gameplay",
    label: "Gameplay",
    icon: (
      <svg viewBox="0 0 24 24" className="w-6 h-6" aria-hidden>
        <path d="M6 8l-4 8h5l3 4h4l3-4h5l-4-8H6zm3 2h6l2.5 5H6.5L9 10z" fill="currentColor" />
      </svg>
    ),
  },
  {
    key: "account",
    label: "Account", // ← updated label
    icon: (
      <svg viewBox="0 0 24 24" className="w-6 h-6" aria-hidden>
        <path
          d="M12 12a5 5 0 100-10 5 5 0 000 10zm0 2c-5 0-9 2.69-9 6v2h18v-2c0-3.31-4-6-9-6z"
          fill="currentColor"
        />
      </svg>
    ),
  },
  {
    key: "membership",
    label: "Membership",
    icon: (
      <svg viewBox="0 0 24 24" className="w-6 h-6" aria-hidden>
        <path d="M12 2l3 7h7l-5.5 4.1L18 22l-6-3.8L6 22l1.5-8.9L2 9h7z" fill="currentColor" />
      </svg>
    ),
  },
];

export default function SettingsShell({ bootstrap }: { bootstrap: Bootstrap }) {
  const [active, setActive] = React.useState<"profile"|"audio"|"vision"|"gameplay"|"account"|"membership">("profile");

  // mimic main sidebar
  const baseRow = [
    "flex items-stretch w-full select-none transition",
    "hover:bg-[#e8e8e8] active:bg-[#e0e0e0]",
    "text-[#0f0f0f]",
  ].join(" ");
  const col1 = "w-12 flex items-center justify-center p-3";
  const col2 = "flex-1 flex items-center p-3 text-base font-medium";

  return (
    <div
      className={[
        "w-full",
        "bg-[#f4f4f4] border border-[#d7d7d7]",
        "rounded-2xl overflow-hidden",
      ].join(" ")}
    >
      <div className="grid grid-cols-[240px_1fr]">
        {/* LEFT: Settings sidebar (rounded on the container's left) */}
        <aside className="border-r border-[#d7d7d7]">
          {ROWS.map((row) => {
            const isActive = active === row.key;
            return (
              <button
                key={row.key}
                type="button"
                onClick={() => setActive(row.key)}
                className={[baseRow, isActive ? "bg-[#eaeaea]" : ""].join(" ")}
              >
                <div className={col1} aria-hidden>
                  {row.icon}
                </div>
                <div className={col2}>{row.label}</div>
              </button>
            );
          })}
        </aside>

        {/* RIGHT: Content area.
            For "profile", render directly on the shell background (no inner white card). */}
        <section className={active === "profile" ? "p-6 min-h-[420px]" : "bg-white p-6 min-h-[420px]"}>
          <div className="max-w-2xl">
            {active === "profile" ? (
              <ProfileLayout bootstrap={bootstrap} />
            ) : (
              <>
                <h2 className="text-2xl font-semibold text-[#0f0f0f]">
                  {ROWS.find((r) => r.key === active)?.label}
                </h2>
                <p className="mt-2 text-[#373737]">
                  Content for <span className="font-medium">{active}</span> will appear here.
                </p>
                <div className="mt-6 rounded-lg border border-[#dcdcdc] bg-[#fbfbfb] p-4 text-sm text-[#0f0f0f]">
                  Placeholder — we’ll wire up each section (Profile, Audio, Vision, Gameplay, Account, Membership) next.
                </div>
              </>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
