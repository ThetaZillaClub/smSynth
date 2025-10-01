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
  avatarPath: string | null;       // may be null (we're avoiding /auth/v1/user on server)
  studentImagePath: string | null; // models.image_path (server-fetched)
};

export default function ProfileLayout({ bootstrap }: { bootstrap: Bootstrap }) {
  const supabase = React.useMemo(() => createClient(), []);
  const [uid, setUid] = React.useState<string | null>(bootstrap.uid);
  const [displayName, setDisplayName] = React.useState<string>(bootstrap.displayName);
  const [avatarPath, setAvatarPath] = React.useState<string | null>(bootstrap.avatarPath);
  const [avatarUrl, setAvatarUrl] = React.useState<string | null>(null);

  // Resolve URL from either avatarPath or studentImagePath (no extra GET endpoints; Storage signing only)
  React.useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        // Prefer explicit avatar (auth user_metadata) if we already have it
        if (bootstrap.avatarPath) {
          const { data, error } = await supabase.storage.from('avatars').createSignedUrl(bootstrap.avatarPath, 600);
          if (!cancel) setAvatarUrl(error ? null : (data?.signedUrl ?? null));
          return;
        }

        // If server didn’t pass avatarPath (to avoid /auth/v1/user), try client session (no network)
        const { data: sess } = await supabase.auth.getSession();
        const metaAvatar = (sess.session?.user?.user_metadata?.avatar_path as string | undefined) ?? null;
        if (metaAvatar) {
          const { data, error } = await supabase.storage.from('avatars').createSignedUrl(metaAvatar, 600);
          if (!cancel) {
            if (!error) {
              setAvatarPath(metaAvatar);
              setAvatarUrl(data?.signedUrl ?? null);
              return;
            }
          }
        }

        // Fallback: student image from models.image_path
        if (bootstrap.studentImagePath) {
          const url = await getImageUrlCached(supabase, bootstrap.studentImagePath);
          if (!cancel) setAvatarUrl(url ?? null);
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
