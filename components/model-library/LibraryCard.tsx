// components/model-library/LibraryCard.tsx
'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { LibraryModel } from './Library';

export default function LibraryCard({ model }: { model: LibraryModel }) {
  const supabase = createClient();
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    (async () => {
      if (!model.image_path) {
        setUrl(null);
        return;
      }

      try {
        // Prefer signed URL (private bucket)
        const { data: signed, error: signErr } = await supabase
          .storage
          .from('model-images')
          .createSignedUrl(model.image_path, 60 * 60);
        if (!signErr && signed?.signedUrl) {
          if (mounted) setUrl(signed.signedUrl);
          return;
        }

        // Fallback: public URL
        const { data: pub } = supabase
          .storage
          .from('model-images')
          .getPublicUrl(model.image_path);
        if (mounted) setUrl(pub?.publicUrl ?? null);
      } catch {
        if (mounted) setUrl(null);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [model.image_path, supabase]);

  return (
    <>
      <div className="w-full aspect-square bg-gray-300 rounded-t-lg overflow-hidden">
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt={model.name} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full grid place-items-center text-sm text-gray-600">No Image</div>
        )}
      </div>
      <div className="py-4 text-center">
        <p className="font-medium text-[#0f0f0f]">{model.name}</p>
        <p className="text-sm text-[#373737] mt-1">by {model.creator_display_name}</p>
      </div>
    </>
  );
}
