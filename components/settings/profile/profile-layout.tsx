// components/settings/profile/profile-layout.tsx
'use client';

import * as React from 'react';
import { createClient } from '@/lib/supabase/client';
import { getImageUrlCached } from '@/lib/client-cache';
import AvatarRow from './avatar/AvatarRow';
import DisplayNameRow from './display-name/DisplayNameRow';

type Bootstrap = {
  uid: string;
  displayName: string;
  avatarPath: string | null;
  studentImagePath: string | null;
};

export default function ProfileLayout({ bootstrap }: { bootstrap: Bootstrap }) {
  const supabase = React.useMemo(() => createClient(), []);
  const [uid, setUid] = React.useState<string | null>(bootstrap.uid);
  const [displayName, setDisplayName] = React.useState<string>(bootstrap.displayName);
  const [avatarPath, setAvatarPath] = React.useState<string | null>(bootstrap.avatarPath);
  const [avatarUrl, setAvatarUrl] = React.useState<string | null>(null);

  // Resolve a URL for either avatarPath or studentImagePath (no extra GETs)
  React.useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        if (bootstrap.avatarPath) {
          const { data, error } = await supabase.storage.from('avatars').createSignedUrl(bootstrap.avatarPath, 600);
          if (!cancel) setAvatarUrl(error ? null : (data?.signedUrl ?? null));
          return;
        }
        if (bootstrap.studentImagePath) {
          const url = await getImageUrlCached(supabase, bootstrap.studentImagePath);
          if (!cancel) setAvatarUrl(url ?? null);
          // Hint Sidebar for future routes so it won’t fetch:
          try { localStorage.setItem('ptp:studentImagePath', bootstrap.studentImagePath); } catch {}
        } else {
          if (!cancel) setAvatarUrl(null);
        }
      } catch {
        if (!cancel) setAvatarUrl(null);
      }
    })();
    return () => { cancel = true; };
  }, [supabase, bootstrap.avatarPath, bootstrap.studentImagePath]);

  React.useEffect(() => { setUid(bootstrap.uid); }, [bootstrap.uid]);
  React.useEffect(() => { setDisplayName(bootstrap.displayName); }, [bootstrap.displayName]);
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
      <DisplayNameRow initialName={displayName} onChanged={setDisplayName} />
    </div>
  );
}
