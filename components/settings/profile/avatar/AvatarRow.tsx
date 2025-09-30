// components/settings/profile/avatar/AvatarRow.tsx
'use client';

import * as React from 'react';
import Image from 'next/image';
import { createClient } from '@/lib/supabase/client';
import { ensureSessionReady, getImageUrlCached } from '@/lib/client-cache';
import { useSupabaseUpload } from '@/hooks/setup/use-supabase-upload';
import { Dropzone, DropzoneContent, DropzoneEmptyState } from '@/components/auth/dropzone';

type Props = { name: string };

export default function AvatarRow({ name }: Props) {
  const supabase = React.useMemo(() => createClient(), []);
  const [avatarPath, setAvatarPath] = React.useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [err, setErr] = React.useState<string | null>(null);

  // Load current avatar; if absent, fall back to the student's image used in the sidebar
  React.useEffect(() => {
    let cancel = false;
    (async () => {
      setLoading(true);
      setErr(null);
      try {
        await ensureSessionReady(supabase, 2000);
        const { data: { session } } = await supabase.auth.getSession();
        const user = session?.user;

        const path = (user?.user_metadata?.avatar_path as string | undefined) || null;
        if (cancel) return;
        setAvatarPath(path);

        if (path) {
          // Primary: user avatar (bucket: avatars)
          const { data, error } = await supabase.storage.from('avatars').createSignedUrl(path, 600);
          if (error) throw error;
          if (!cancel) setAvatarUrl(data?.signedUrl ?? null);
        } else {
          // Fallback: student image already shown in the sidebar (bucket: model-images)
          // GET /api/students/current -> id -> /api/students/:id -> image_path -> sign
          try {
            const currRes = await fetch('/api/students/current', { credentials: 'include' });
            const curr = await currRes.json().catch(() => null);
            const id = (curr?.id as string | undefined) ?? null;

            if (id) {
              const rowRes = await fetch(`/api/students/${encodeURIComponent(id)}`, { credentials: 'include' });
              const row = await rowRes.json().catch(() => null);
              const imagePath = row?.image_path as string | null | undefined;

              if (imagePath) {
                const signed = await getImageUrlCached(supabase, imagePath);
                if (!cancel) setAvatarUrl(signed ?? null);
              } else {
                if (!cancel) setAvatarUrl(null);
              }
            } else {
              if (!cancel) setAvatarUrl(null);
            }
          } catch {
            if (!cancel) setAvatarUrl(null);
          }
        }
      } catch (e: any) {
        if (!cancel) setErr(e?.message || 'Failed to load avatar.');
      } finally {
        if (!cancel) setLoading(false);
      }
    })();
    return () => { cancel = true; };
  }, [supabase]);

  // Dropzone setup (only used when no avatar is available)
  const [uid, setUid] = React.useState<string | null>(null);
  React.useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setUid(data.session?.user?.id ?? null));
  }, [supabase]);

  const dz = useSupabaseUpload({
    bucketName: 'avatars',
    path: uid ?? undefined,          // store under user folder
    allowedMimeTypes: ['image/*'],
    maxFiles: 1,
    maxFileSize: 8 * 1000 * 1000,    // 8MB
    cacheControl: 3600,
    upsert: true,
  });

  // When upload succeeds, write avatar_path to user metadata and resolve signed URL
  React.useEffect(() => {
    (async () => {
      if (!uid) return;
      if (!dz.isSuccess || dz.successes.length === 0) return;
      const filename = dz.successes[0];
      const path = `${uid}/${filename}`;

      const { error: updErr } = await supabase.auth.updateUser({ data: { avatar_path: path } });
      if (updErr) { setErr(updErr.message); return; }

      setAvatarPath(path);
      const { data, error } = await supabase.storage.from('avatars').createSignedUrl(path, 600);
      if (error) { setErr(error.message); return; }
      setAvatarUrl(data?.signedUrl ?? null);
    })();
  }, [dz.isSuccess, dz.successes, supabase, uid]);

  return (
    <div className="flex items-start gap-6">
      {/* Avatar box (square) — white bg, no border */}
      <div className="relative w-28 h-28 rounded-xl overflow-hidden bg-white">
        {loading ? null : avatarUrl ? (
          <Image
            src={avatarUrl}
            alt={`${name} avatar`}
            fill
            unoptimized
            className="object-cover"
            priority
          />
        ) : (
          // No avatar yet -> square dropzone with big centered “?”
          <Dropzone
            {...dz}
            className="absolute inset-0 grid place-items-center bg-white border-none p-0"
          >
            {/* Ensure the placeholder is perfectly centered */}
            <DropzoneEmptyState className="w-full h-full grid place-items-center" />
            <DropzoneContent className="w-full" />
          </Dropzone>
        )}
      </div>

      {/* Display name aligned with top of avatar */}
      <div className="min-w-0">
        <h3 className="text-2xl font-semibold text-[#0f0f0f] truncate">{name}</h3>
        {err && <p className="text-sm text-red-600 mt-1">{err}</p>}
      </div>
    </div>
  );
}
