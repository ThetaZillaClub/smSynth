// components/settings/profile/profile-layout.tsx
'use client';

import * as React from 'react';
import { createClient } from '@/lib/supabase/client';
import { getImageUrlCached } from '@/lib/client-cache';
import AvatarRow from './avatar/AvatarRow';

type Bootstrap = {
  uid: string;
  displayName: string;            // client bootstrap value
  avatarPath: string | null;      // not used as SSoT (kept for compat), image from models.image_path
  studentImagePath: string | null;
};

export default function ProfileLayout({ bootstrap }: { bootstrap: Bootstrap }) {
  const supabase = React.useMemo(() => createClient(), []);
  const [uid, setUid] = React.useState<string | null>(bootstrap.uid);
  const [displayName, setDisplayName] = React.useState<string>(bootstrap.displayName);
  const [avatarPath, setAvatarPath] = React.useState<string | null>(bootstrap.avatarPath);
  const [avatarUrl, setAvatarUrl] = React.useState<string | null>(null);

  // Resolve avatar URL from latest models.image_path (or from bootstrap.studentImagePath)
  React.useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const user = session?.user;
        if (!user) return;

        const { data: latest } = await supabase
          .from('models')
          .select('image_path, creator_display_name')
          .eq('uid', user.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        const imgPath = latest?.image_path ?? bootstrap.studentImagePath ?? null;
        const name = latest?.creator_display_name ?? bootstrap.displayName;

        if (imgPath) {
          const url = await getImageUrlCached(supabase, imgPath);
          if (!cancel) {
            setAvatarPath(imgPath);
            setAvatarUrl(url ?? null);
            try { localStorage.setItem('ptp:studentImagePath', imgPath); } catch {}
          }
        } else if (!cancel) {
          setAvatarUrl(null);
        }

        if (!cancel) setDisplayName(name);
      } catch {
        if (!cancel) setAvatarUrl(null);
      }
    })();
    return () => { cancel = true; };
  }, [supabase, bootstrap.studentImagePath, bootstrap.displayName]);

  React.useEffect(() => { setUid(bootstrap.uid); }, [bootstrap.uid]);
  React.useEffect(() => { setAvatarPath(bootstrap.avatarPath); }, [bootstrap.avatarPath]);

  return (
    <div className="space-y-8">
      <AvatarRow
        name={displayName}
        uid={uid}
        initialAvatarPath={avatarPath}
        initialAvatarUrl={avatarUrl}
        onAvatarChanged={(url, path) => {
          setAvatarUrl(url);
          setAvatarPath(path);
        }}
      />
    </div>
  );
}
