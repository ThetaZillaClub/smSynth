/* ────────────────────────────────────────────────────────────────
   File: src/components/auth/SignOutButton.tsx
   Desc: “Log Out” control – text-link style identical to “Login”.
          Pressing it signs out via Supabase, clears local state,
          then returns the user to the public landing page.
───────────────────────────────────────────────────────────────── */
'use client';
import { type FC, type JSX } from 'react';
const SignOutButton: FC = (): JSX.Element => {
  return (
    <form action="/auth/signout" method="post">
      <button
        type="submit"
        className="
          text-base md:text-base
          text-[#2d2d2d]
          transition ease-in-out duration-200
          hover:underline underline-offset-4
        "
      >
        Log&nbsp;Out
      </button>
    </form>
  );
};
export default SignOutButton;