// components/settings/account/LogoutRow.tsx
"use client";

import * as React from "react";
import { LogoutButton } from "@/components/auth/logout-button";

const ROW = "grid items-center gap-3 grid-cols-[160px_minmax(0,1fr)_220px]";
const BTN = "h-9 px-3 text-sm"; // uniform smaller size

export default function LogoutRow() {
  return (
    <div className={ROW}>
      {/* Left edge: the button (no label text) */}
      <div className="col-span-1">
        <LogoutButton className={BTN} />
      </div>
      <div /> {/* keep grid alignment */}
      <div /> {/* keep grid alignment */}
    </div>
  );
}
