// app/stats/page.tsx
'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import HomeHeader from '@/components/home/HomeHeader';
import { STUDENT_IMAGE_HINT_KEY } from '@/components/sidebar/types';
import { HomeBootstrapProvider } from '@/components/home/HomeBootstrap';
import StudentStats from '@/components/stats/StudentStats';

function pickDisplayNameFromEmail(email?: string | null) {
  return email?.split('@')?.[0] ?? 'You';
}
function pickAvatarUrlFromMeta(user: { user_metadata?: unknown }): string | null {
  const meta = user.user_metadata;
  if (meta && typeof meta === 'object' && 'avatar_url' in meta) {
    const v = (meta as { avatar_url?: unknown }).avatar_url;
    if (typeof v === 'string' && v.trim()) return v;
  }
  return null;
}

export default function StatsPage() {
  const supabase = React.useMemo(() => createClient(), []);
  const router = useRouter();

  const [bootstrap, setBootstrap] = React.useState<null | {
    uid: string;
    displayName: string;
    avatarUrl: string | null;
    studentImagePath: string | null;
  }>(null);

  React.useEffect(() => {
    let cancel = false;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user) {
        router.replace('/auth/login?next=/stats');
        return;
      }

      const { data: model } = await supabase
        .from('models')
        .select('creator_display_name, image_path')
        .eq('uid', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (cancel) return;

      const displayName =
        (model?.creator_display_name?.trim?.()
          ? model!.creator_display_name!.trim()
          : null) ?? pickDisplayNameFromEmail(user.email);

      const studentImagePath = model?.image_path ?? null;
      if (studentImagePath) {
        try { localStorage.setItem(STUDENT_IMAGE_HINT_KEY, studentImagePath); } catch {}
      }

      setBootstrap({
        uid: user.id,
        displayName,
        avatarUrl: pickAvatarUrlFromMeta(user),
        studentImagePath,
      });
    })();
    return () => { cancel = true; };
  }, [supabase, router]);

  if (!bootstrap) {
    return <div className="min-h-screen bg-gradient-to-b from-[#f0f0f0] to-[#d2d2d2]" />;
  }

  return (
    <HomeBootstrapProvider value={{ uid: bootstrap.uid }}>
      {/* Match GameLayout: full viewport, no width cap */}
      <main className="min-h-dvh h-dvh flex flex-col bg-gradient-to-b from-[#f0f0f0] to-[#d2d2d2] text-[#0f0f0f]">
        {/* Header (natural height) */}
        <div className="px-6 pt-8 pb-3">
          <HomeHeader
            displayName={bootstrap.displayName}
            avatarUrl={bootstrap.avatarUrl}
            studentImagePath={bootstrap.studentImagePath}
          />
          <div className="mt-2 text-sm text-[#0f0f0f]/70">Detailed statistics</div>
        </div>

        {/* Content fills remaining space like GameLayout */}
        <div className="flex-1 min-h-0 px-0 md:px-6 pb-4">
          <StudentStats />
        </div>
      </main>
    </HomeBootstrapProvider>
  );
}
