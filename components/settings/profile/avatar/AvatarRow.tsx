// components/settings/profile/avatar/AvatarRow.tsx
'use client';

import * as React from 'react';
import Image from 'next/image';
import { createClient } from '@/lib/supabase/client';
import { useSupabaseUpload } from '@/hooks/setup/use-supabase-upload';
import { Dropzone, DropzoneContent, DropzoneEmptyState } from '@/components/auth/dropzone';
import { STUDENT_IMAGE_HINT_KEY } from '@/components/sidebar/types';

type Props = {
  name: string;
  uid: string | null;                         // provided by parent; avoids another getSession() call
  initialAvatarPath?: string | null;          // kept for compatibility (not used internally)
  initialAvatarUrl?: string | null;           // already-signed (or public) URL ready to render
  onAvatarChanged?: (url: string | null, path: string | null) => void;
};

export default function AvatarRow(props: Props) {
  const { name, uid, initialAvatarUrl = null, onAvatarChanged } = props;

  const supabase = React.useMemo(() => createClient(), []);
  const [avatarUrl, setAvatarUrl] = React.useState<string | null>(initialAvatarUrl);
  const [err, setErr] = React.useState<string | null>(null);

  React.useEffect(() => { setAvatarUrl(initialAvatarUrl ?? null); }, [initialAvatarUrl]);

  const dz = useSupabaseUpload({
    bucketName: 'model-images',
    path: uid ? uid : undefined,              // store under user folder (uid/filename)
    allowedMimeTypes: ['image/*'],
    maxFiles: 1,
    maxFileSize: 8 * 1000 * 1000,             // 8MB
    cacheControl: 3600,
    upsert: true,
  });

  React.useEffect(() => {
    (async () => {
      if (!uid) return;
      if (!dz.isSuccess || dz.successes.length === 0) return;

      try {
        setErr(null);
        const filename = dz.successes[0];

        // Storage object key and full DB path (with bucket)
        const objectKey = `${uid}/${filename}`;                  // storage object
        const dbPath = `avatars/${objectKey}`;                   // what we persist & hint

        // Find latest model id
        const { data: latest, error: findErr } = await supabase
          .from('models')
          .select('id')
          .eq('uid', uid)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (findErr) throw findErr;
        if (!latest?.id) throw new Error('No model row to update.');

        // Update models.image_path to include the BUCKET prefix
        const { error: updErr } = await supabase
          .from('models')
          .update({ image_path: dbPath })
          .eq('id', latest.id);

        if (updErr) throw updErr;

        // Resolve a signed URL for immediate preview
        const { data, error } = await supabase.storage.from('model-images').createSignedUrl(objectKey, 600);
        if (error) throw error;

        const url = data?.signedUrl ?? null;
        setAvatarUrl(url);

        // Persist hint (same value other readers expect)
        try { localStorage.setItem(STUDENT_IMAGE_HINT_KEY, dbPath); } catch {}

        onAvatarChanged?.(url, dbPath);
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : 'Failed to save new avatar.';
        setErr(message);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dz.isSuccess, dz.successes, supabase, uid]);

  return (
    <div className="flex items-start gap-6">
      {/* Avatar box (square) — white bg, no border */}
      <div className="relative w-28 h-28 rounded-xl overflow-hidden bg-white">
        {avatarUrl ? (
          <Image
            src={avatarUrl}
            alt={`${name} avatar`}
            fill
            unoptimized
            className="object-cover"
            priority
          />
        ) : (
          <Dropzone
            {...dz}
            className="absolute inset-0 grid place-items-center bg-white border-none p-0"
          >
            <DropzoneEmptyState className="w-full h-full grid place-items-center" />
            <DropzoneContent className="w-full" />
          </Dropzone>
        )}
      </div>

      <div className="min-w-0">
        <h3 className="text-2xl font-semibold text-[#0f0f0f] truncate">{name}</h3>
        {err && <p className="text-sm text-red-600 mt-1">{err}</p>}
      </div>
    </div>
  );
}
