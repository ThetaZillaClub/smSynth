/* Client sign-out so header updates instantly */
'use client';
import { type FC, type JSX } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';

const SignOutButton: FC = (): JSX.Element => {
  const router = useRouter();

  const onSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    // local listeners in PrimaryHeader will flip authed + cookie/global seed
    router.push('/auth/login');
  };

  return (
    <button
      type="button"
      onClick={onSignOut}
      className="
        text-base md:text-base
        text-[#2d2d2d]
        transition ease-in-out duration-200
        hover:underline underline-offset-4
      "
    >
      Log&nbsp;Out
    </button>
  );
};

export default SignOutButton;
