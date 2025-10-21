// components/settings/profile/avatar/AvatarRow.tsx
'use client';

import * as React from 'react';
import { createClient } from '@/lib/supabase/client';
import { useSupabaseUpload } from '@/hooks/setup/use-supabase-upload';
import {
  DropzoneRoot,
  DropzoneFrame,
  DropzoneEmptyState,
  DropzonePanel,
} from '@/components/auth/dropzone';
import { STUDENT_IMAGE_HINT_KEY } from '@/components/sidebar/types';
import StudentImage from '@/components/student-home/StudentImage';

type Props = {
  name: string;
  uid: string | null;
  initialAvatarPath?: string | null;
  initialAvatarUrl?: string | null;
  onAvatarChanged?: (url: string | null, path: string | null) => void;
  /** If true, this component may sign a URL using a localStorage hint (fallback). */
  enableLocalHintFallback?: boolean;
};

const EMPTY_DELAY_MS = 500; // wait before showing the "?" so we don't flash it

export default function AvatarRow(props: Props) {
  const {
    name,
    uid,
    initialAvatarUrl = null,
    onAvatarChanged,
    enableLocalHintFallback = true,
  } = props;

  const supabase = React.useMemo(() => createClient(), []);
  const [avatarUrl, setAvatarUrl] = React.useState<string | null>(initialAvatarUrl ?? null);
  const [initializing, setInitializing] = React.useState<boolean>(true);
  const [err, setErr] = React.useState<string | null>(null);
  const [showEmpty, setShowEmpty] = React.useState<boolean>(false);

  // Always mirror parent updates, including null/empty
  React.useEffect(() => {
    setAvatarUrl(initialAvatarUrl ?? null);
  }, [initialAvatarUrl]);

  // Delayed localStorage fallback (prevents dupe signing if parent resolves quickly)
  React.useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        if (!enableLocalHintFallback) {
          setInitializing(false);
          return;
        }
        if (avatarUrl || !uid) {
          setInitializing(false);
          return;
        }

        // Give parent a brief head start
        await new Promise((r) => setTimeout(r, 200));
        if (cancelled || avatarUrl) {
          setInitializing(false);
          return;
        }

        let dbPath: string | null = null;
        try { dbPath = localStorage.getItem(STUDENT_IMAGE_HINT_KEY); } catch {}

        if (!dbPath || !dbPath.startsWith('model-images/')) {
          setInitializing(false);
          return;
        }

        const objectKey = dbPath.replace(/^model-images\//, '');
        const { data, error } = await supabase.storage
          .from('model-images')
          .createSignedUrl(objectKey, 600);

        if (cancelled) return;
        if (error) throw error;

        const url = data?.signedUrl ?? null;
        if (url) setAvatarUrl(url);
      } catch {
        /* ignore; we’ll fall back to empty state */
      } finally {
        if (!cancelled) setInitializing(false);
      }
    })();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, uid, enableLocalHintFallback, avatarUrl]);

  const dz = useSupabaseUpload({
    bucketName: 'model-images',
    path: uid ? uid : undefined,
    allowedMimeTypes: ['image/*'],
    maxFiles: 1,
    maxFileSize: 8 * 1000 * 1000,
    cacheControl: 3600,
    upsert: true,
  });

  const selectedPreview =
    dz.files.find((f) => f.type.startsWith('image/'))?.preview ?? null;

  // Only show the "?" after a short delay if we *still* have no preview/URL
  React.useEffect(() => {
    if (initializing || selectedPreview || avatarUrl) {
      setShowEmpty(false);
      return;
    }
    const t = setTimeout(() => setShowEmpty(true), EMPTY_DELAY_MS);
    return () => clearTimeout(t);
  }, [initializing, selectedPreview, avatarUrl]);

  // After upload, update DB + signed URL
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

        const { data, error } = await supabase.storage
          .from('model-images')
          .createSignedUrl(objectKey, 600);
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

  // Fade-in control — start invisible, show once the image has loaded
  const [imgLoaded, setImgLoaded] = React.useState<boolean>(false);
  React.useEffect(() => { setImgLoaded(false); }, [avatarUrl, selectedPreview]);

  const renderFrameContent = () => {
    // Prefer a selected preview if present (plain <img> like your StudentImage)
    if (selectedPreview) {
      return (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={selectedPreview}
          alt={`${name} avatar preview`}
          className="w-full h-full object-cover"
          onLoad={() => setImgLoaded(true)}
          onError={() => setImgLoaded(true)}
          draggable={false}
        />
      );
    }

    // Then the persisted avatar URL (use the same component that works elsewhere)
    if (avatarUrl) {
      return (
        <div className="absolute inset-0">
          <StudentImage imgUrl={avatarUrl} alt={`${name} avatar`} visible />
        </div>
      );
    }

    // While initializing (resolving signed URL), render nothing
    if (initializing) return null;

    // Still nothing? Only show the "?" after the delay window to avoid FOUC
    if (!showEmpty) return null;

    return <DropzoneEmptyState className="w-full h-full" />;
  };

  return (
    <DropzoneRoot {...dz}>
      <div className="flex flex-col gap-2">
        <div className="flex items-start gap-6">
          {/* Clickable avatar frame; blank while loading (no skeleton/overlay) */}
          <DropzoneFrame className="relative w-28 h-28 rounded-xl overflow-hidden bg-white border-none">
            {renderFrameContent()}
          </DropzoneFrame>

          <div className="min-w-0">
            <h3 className="text-2xl font-semibold text-[#0f0f0f] truncate">{name}</h3>
            {err && <p className="text-sm text-red-600 mt-1">{err}</p>}
          </div>
        </div>

        {/* Info + Upload button under the frame */}
        <DropzonePanel className="max-w-sm" showThumbnails={false} />
      </div>
    </DropzoneRoot>
  );
}
