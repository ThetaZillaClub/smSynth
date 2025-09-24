// components/header/PrivateHeader.tsx
"use client";

import PrimaryHeader from "./PrimaryHeader";
import type { PrimaryHeaderProps } from "./PrimaryHeader";

/**
 * Private pages already passed middleware auth, so we can render the header
 * in an "authenticated" state without any client getSession() call.
 */
export default function PrivateHeader(props: Omit<PrimaryHeaderProps, "initialAuthed">) {
  return <PrimaryHeader {...props} initialAuthed />;
}
