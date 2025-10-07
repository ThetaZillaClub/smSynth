// components/settings/account/account-layout.tsx
"use client";

import * as React from "react";
import DisplayNameRow from "./DisplayNameRow";
import PasswordRow from "./PasswordRow";
import LogoutRow from "./LogoutRow";

type Bootstrap = {
  uid: string;
  displayName: string;
  avatarPath: string | null;
  studentImagePath: string | null;
};

function SectionDivider() {
  return (
    <div className="my-8">
      <div className="h-px bg-[#e6e6e6] mx-3 sm:mx-4 md:mx-6 rounded-full" />
    </div>
  );
}

export default function AccountLayout({ bootstrap }: { bootstrap: Bootstrap }) {
  const [name, setName] = React.useState(bootstrap.displayName ?? "");

  return (
    <div className="space-y-6">
      <DisplayNameRow initialName={name} onChanged={setName} />
      <SectionDivider />
      <PasswordRow />
      <SectionDivider />
      <LogoutRow />
    </div>
  );
}
