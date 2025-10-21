// Always render the DropzoneFrame. Inside it:
//   - if a file is selected and is an image, show its preview
//   - else, show the saved avatarUrl
//   - else, show the "?" empty state
// Render the panel UNDER the frame and hide thumbnails there.

'use client';

import * as React from 'react';
import Image from 'next/image';
import { createClient } from '@/lib/supabase/client';
import { useSupabaseUpload } from '@/hooks/setup/use-supabase-upload';
import {
  DropzoneRoot,
  DropzoneFrame,
  DropzoneEmptyState,
  DropzonePanel,
} from '@/components/auth/dropzone';
import { STUDENT_IMAGE_HINT_KEY } from '@/components/sidebar/types';

type Props = {
  name: string;
  uid: string | null;
  initialAvatarPath?: string | null;
  initialAvatarUrl?: string | null;
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
    path: uid ? uid : undefined,
    allowedMimeTypes: ['image/*'],
    maxFiles: 1,
    maxFileSize: 8 * 1000 * 1000,
    cacheControl: 3600,
    upsert: true,
  });

  // choose the selected image preview (if any)
  const selectedPreview =
    dz.files.find((f) => f.type.startsWith('image/'))?.preview ?? null;

  React.useEffect(() => {
    (async () => {
      if (!uid) return;
      if (!dz.isSuccess || dz.successes.length === 0) return;

      try {
        setErr(null);
        const filename = dz.successes[dz.successes.length - 1];
        const objectKey = `${uid}/${filename}`;
        const dbPath = `model-images/${objectKey}`;

        const { data: latest, error: findErr } = await supabase
          .from('models')
          .select('id')
          .eq('uid', uid)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (findErr) throw findErr;
        if (!latest?.id) throw new Error('No model row to update.');

        const { error: updErr } = await supabase
          .from('models')
          .update({ image_path: dbPath })
          .eq('id', latest.id);
        if (updErr) throw updErr;

        const { data, error } = await supabase.storage.from('model-images').createSignedUrl(objectKey, 600);
        if (error) throw error;

        const url = data?.signedUrl ?? null;
        setAvatarUrl(url);
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
    <DropzoneRoot {...dz}>
      <div className="flex flex-col gap-2">
        <div className="flex items-start gap-6">
          {/* Clickable avatar frame */}
          <DropzoneFrame className="relative w-28 h-28 rounded-xl overflow-hidden bg-white border-none">
            {selectedPreview ? (
              <Image src={selectedPreview} alt={`${name} avatar preview`} fill unoptimized className="object-cover" />
            ) : avatarUrl ? (
              <Image src={avatarUrl} alt={`${name} avatar`} fill unoptimized className="object-cover" priority />
            ) : (
              <DropzoneEmptyState className="w-full h-full" />
            )}
          </DropzoneFrame>

          <div className="min-w-0">
            <h3 className="text-2xl font-semibold text-[#0f0f0f] truncate">{name}</h3>
            {err && <p className="text-sm text-red-600 mt-1">{err}</p>}
          </div>
        </div>

        {/* ⬇️ All text + Upload button live under the frame now; no thumbnails */}
        <DropzonePanel className="max-w-sm" showThumbnails={false} />
      </div>
    </DropzoneRoot>
  )
}
