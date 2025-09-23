'use client';

import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export default function ModelImage({
  imagePath,
  alt,
}: {
  imagePath: string | null;
  alt: string;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    (async () => {
      if (!imagePath) {
        setUrl(null);
        return;
      }

      try {
        const { data: signed, error: signErr } = await supabase
          .storage
          .from('model-images')
          .createSignedUrl(imagePath, 60 * 60);

        if (!signErr && signed?.signedUrl) {
          if (mounted) setUrl(signed.signedUrl);
          return;
        }

        const { data: pub } = supabase.storage
          .from('model-images')
          .getPublicUrl(imagePath);
        if (mounted) setUrl(pub?.publicUrl ?? null);
      } catch {
        if (mounted) setUrl(null);
      }
    })();

    return () => { mounted = false; };
  }, [imagePath, supabase]);

  return (
    <div className="w-full">
      <div className="w-full aspect-square rounded-lg overflow-hidden bg-gray-200 grid place-items-center">
        {url ? (
          <img src={url} alt={alt} className="w-full h-full object-cover" />
        ) : (
          <span className="text-sm text-[#373737]">No Image</span>
        )}
      </div>
    </div>
  );
}
