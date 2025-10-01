// components/settings/profile/profile-layout.tsx
'use client';

import * as React from 'react';
import { createClient } from '@/lib/supabase/client';
import { getImageUrlCached } from '@/lib/client-cache';
import AvatarRow from './avatar/AvatarRow';
import DisplayNameRow from './display-name/DisplayNameRow';
import SignOutRow from './signout/SignOutRow';

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
        // Prefer fresh fetch of the latest image_path (cheap)
        const { data: { session } } = await supabase.auth.getSession();
        const user = session?.user;
        if (!user) return;

        const { data: latest } = await supabase
          .from('models')
          .select('image_path')
          .eq('uid', user.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        const imgPath = latest?.image_path ?? bootstrap.studentImagePath ?? null;
        if (!imgPath) {
          if (!cancel) setAvatarUrl(null);
          return;
        }

        const url = await getImageUrlCached(supabase, imgPath);
        if (!cancel) {
          setAvatarPath(imgPath);
          setAvatarUrl(url ?? null);
          try { localStorage.setItem('ptp:studentImagePath', imgPath); } catch {}
        }
      } catch {
        if (!cancel) setAvatarUrl(null);
      }
    })();
    return () => { cancel = true; };
  }, [supabase, bootstrap.studentImagePath]);

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
      {/* onChanged updates our local state immediately after update succeeds */}
      <DisplayNameRow initialName={displayName} onChanged={setDisplayName} />
      {/* Sign out action */}
      <SignOutRow />
    </div>
  );
}
