// components/settings/profile/profile-layout.tsx
'use client';

import * as React from 'react';
import { createClient } from '@/lib/supabase/client';
import { getImageUrlCached, ensureSessionReady } from '@/lib/client-cache';
import AvatarRow from './avatar/AvatarRow';
import { STUDENT_IMAGE_HINT_KEY } from '@/components/sidebar/types';

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

  // Guard to avoid React 18 StrictMode double-run in development
  const ranForUidRef = React.useRef<string | null>(null);

  // Resolve avatar URL from latest models.image_path (or from bootstrap.studentImagePath)
  React.useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        await ensureSessionReady(supabase); // ensure client session before signing/storage work

        const { data: { session } } = await supabase.auth.getSession();
        const user = session?.user;
        if (!user) return;

        // Dev-only guard against StrictMode double-invocation
        if (process.env.NODE_ENV === 'development') {
          if (ranForUidRef.current === user.id) return;
          ranForUidRef.current = user.id;
        }

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
          const url = await getImageUrlCached(supabase, imgPath, { defaultBucket: 'model-images' });
          if (!cancel) {
            setAvatarPath(imgPath);
            setAvatarUrl(url && url.length > 0 ? url : null); // normalize '' → null
            try { localStorage.setItem(STUDENT_IMAGE_HINT_KEY, imgPath); } catch {}
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
        enableLocalHintFallback // allow child to rescue if parent doesn’t resolve in time
        onAvatarChanged={(url, path) => {
          setAvatarUrl(url && url.length > 0 ? url : null);
          setAvatarPath(path);
        }}
      />
    </div>
  );
}
