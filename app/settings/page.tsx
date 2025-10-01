// app/settings/page.tsx
'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import SettingsShell from '@/components/settings/SettingsShell';

function pickDisplayNameFromEmail(email?: string | null) {
  return email?.split('@')?.[0] ?? 'You';
}

export default function SettingsPage() {
  const supabase = React.useMemo(() => createClient(), []);
  const router = useRouter();
  const [bootstrap, setBootstrap] = React.useState<null | {
    uid: string;
    displayName: string;
    avatarPath: string | null;
    studentImagePath: string | null;
  }>(null);

  React.useEffect(() => {
    let cancel = false;

    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user) {
        router.replace('/auth/login?next=/settings');
        return;
      }

      // Get latest model row for this user (SSoT for display name + image)
      const { data: model } = await supabase
        .from('models')
        .select('creator_display_name, image_path')
        .eq('uid', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (cancel) return;

      setBootstrap({
        uid: user.id,
        displayName:
          (model?.creator_display_name?.trim?.() ? model!.creator_display_name!.trim() : null) ??
          pickDisplayNameFromEmail(user.email),
        avatarPath: null, // we now keep avatar in models.image_path, not in auth metadata
        studentImagePath: model?.image_path ?? null,
      });
    })();

    return () => {
      cancel = true;
    };
  }, [supabase, router]);

  if (!bootstrap) {
    // (optional) very light skeleton
    return <div className="min-h-screen bg-gradient-to-b from-[#f0f0f0] to-[#d2d2d2]" />;
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#f0f0f0] to-[#d2d2d2] text-[#0f0f0f]">
      <div className="px-6 pt-8 pb-2 max-w-5xl mx-auto">
        <h1 className="text-3xl font-bold">Settings</h1>
      </div>
      <div className="px-6 pb-10 max-w-5xl mx-auto">
        <SettingsShell bootstrap={bootstrap} />
      </div>
    </div>
  );
}
