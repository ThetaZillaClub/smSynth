// app/model/[id]/page.tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import PrimaryHeader from '@/components/header/PrimaryHeader';

type ModelRow = {
  id: string;
  name: string;
  creator_display_name: string;
  image_path: string | null;
  privacy: 'public' | 'private';
};

export default function ModelDetailPage() {
  const { id } = useParams<{ id: string }>();
  const sp = useSearchParams();
  const supabase = useMemo(() => createClient(), []);
  const [m, setM] = useState<ModelRow | null>(null);
  const [imgUrl, setImgUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        setErr(null);
        setLoading(true);
        const { data, error } = await supabase
          .from('models')
          .select('id,name,creator_display_name,image_path,privacy')
          .eq('id', id)
          .maybeSingle();
        if (error) throw error;
        setM((data as any) ?? null);
      } catch (e: any) {
        setErr(e?.message ?? 'Failed to load model.');
      } finally {
        setLoading(false);
      }
    })();
  }, [id, supabase]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!m?.image_path) { setImgUrl(null); return; }
      try {
        const { data: signed, error: signErr } = await supabase
          .storage
          .from('model-images')
          .createSignedUrl(m.image_path, 60 * 60);
        if (!signErr && signed?.signedUrl) {
          if (mounted) setImgUrl(signed.signedUrl);
          return;
        }
        const { data: pub } = supabase.storage.from('model-images').getPublicUrl(m.image_path);
        if (mounted) setImgUrl(pub?.publicUrl ?? null);
      } catch {
        if (mounted) setImgUrl(null);
      }
    })();
    return () => { mounted = false; };
  }, [m?.image_path, supabase]);

  // Build training href (preserve optional ?sessionId=... passthrough if used downstream)
  const sessionId = sp.get('sessionId');
  const trainingHref = sessionId
    ? `/training?model_id=${encodeURIComponent(String(id))}&sessionId=${encodeURIComponent(sessionId)}`
    : `/training?model_id=${encodeURIComponent(String(id))}`;

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-b from-[#f0f0f0] to-[#d2d2d2] text-[#0f0f0f]">
      <PrimaryHeader />

      <div id="top" className="max-w-5xl mx-auto pt-28 p-6 w-full">
        {loading ? (
          <div className="animate-pulse h-8 w-64 bg-gray-300 rounded" />
        ) : err ? (
          <p className="text-red-600 text-center">{err}</p>
        ) : !m ? (
          <p className="text-center text-[#373737]">Model not found.</p>
        ) : (
          <div className="grid grid-cols-1 gap-8">
            <div className="bg-[#ebebeb] border border-[#d2d2d2] rounded-lg overflow-hidden">
              <div className="w-full aspect-square bg-gray-300">
                {imgUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={imgUrl} alt={m.name} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full grid place-items-center text-sm text-gray-600">
                    No Image
                  </div>
                )}
              </div>
              <div className="p-4">
                <h1 className="text-2xl font-bold">{m.name}</h1>
                <p className="text-sm text-[#373737] mt-1">by {m.creator_display_name}</p>

                <div className="mt-2">
                  <span className="inline-block text-xs rounded-full border border-[#cfcfcf] px-2 py-0.5 text-[#373737]">
                    {m.privacy === 'public' ? 'Public' : 'Private'}
                  </span>
                </div>

                <div className="mt-4 flex gap-3">
                  {/* Light CTA (brand) */}
                  <Link
                    href={trainingHref}
                    prefetch
                    className="px-4 py-2 rounded-md border border-[#d2d2d2] bg-[#f0f0f0] text-[#0f0f0f] hover:bg-white transition"
                  >
                    Launch Training
                  </Link>
                </div>
              </div>
            </div>

            {/* inference panel removed as before */}
          </div>
        )}
      </div>
    </div>
  );
}
