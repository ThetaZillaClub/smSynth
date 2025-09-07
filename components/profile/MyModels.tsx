// components/profile/MyModels.tsx
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

type ModelRow = {
  id: string;
  name: string;
  image_path: string | null;
};

export default function MyModels() {
  const [models, setModels] = useState<ModelRow[]>([]);
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    (async () => {
      try {
        const { data: userRes, error: userErr } = await supabase.auth.getUser();
        if (userErr) throw userErr;
        const user = userRes?.user;
        if (!user) {
          setModels([]);
          return;
        }

        const { data, error } = await supabase
          .from('models')
          .select('id,name,image_path')
          .eq('uid', user.id)
          .order('created_at', { ascending: false });

        if (error) throw error;

        const rows = data ?? [];
        setModels(rows);

        // Signed URLs for images (works with public or private buckets)
        const bucket = supabase.storage.from('model-images');
        const urls: Record<string, string> = {};
        await Promise.all(
          rows.map(async (m) => {
            if (!m.image_path) return;
            const { data: signed, error: signErr } = await bucket.createSignedUrl(
              m.image_path,
              60 * 60 // 1 hour
            );
            if (!signErr && signed?.signedUrl) {
              urls[m.id] = signed.signedUrl;
            }
          })
        );
        setImageUrls(urls);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    })();
  }, [supabase]);

  if (loading) {
    return <p className="text-center py-12">Loading your models…</p>;
  }

  const Grid = (
    <div className="flex flex-wrap justify-center gap-8 max-w-4xl mx-auto">
      {models.map((model) => (
        <Link
          key={model.id}
          href={`/model/${model.id}`}
          className="flex flex-col items-center bg-[#ebebeb] border border-[#d2d2d2] rounded-lg shadow-md hover:shadow-lg transition-shadow basis-[calc(50%-1rem)] max-w-[calc(50%-1rem)] sm:max-w-none"
        >
          <div className="w-full aspect-square bg-gray-300 rounded-t-lg overflow-hidden">
            {imageUrls[model.id] ? (
              <img
                src={imageUrls[model.id]}
                alt={model.name}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full grid place-items-center text-sm text-gray-600">
                No Image
              </div>
            )}
          </div>
          <p className="py-4 text-center font-medium text-[#0f0f0f]">{model.name}</p>
        </Link>
      ))}

      {/* Create New Model tile */}
      <Link
        href="/model-settings"
        className="flex flex-col items-center bg-[#ebebeb] border border-[#d2d2d2] rounded-lg shadow-md hover:shadow-lg transition-shadow basis-[calc(50%-1rem)] max-w-[calc(50%-1rem)] sm:max-w-none"
      >
        <div className="w-full aspect-square bg-gray-200 rounded-t-lg grid place-items-center">
          <span className="flex items-center justify-center w-16 h-16 rounded-full bg-white/70 border border-[#d2d2d2]">
            {/* plus icon */}
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="w-8 h-8 text-[#0f0f0f]"
              aria-hidden="true"
            >
              <path
                fillRule="evenodd"
                d="M10 3a1 1 0 0 1 1 1v5h5a1 1 0 1 1 0 2h-5v5a1 1 0 1 1-2 0v-5H4a1 1 0 1 1 0-2h5V4a1 1 0 0 1 1-1z"
                clipRule="evenodd"
              />
            </svg>
          </span>
        </div>
        <p className="py-4 text-center font-medium text-[#0f0f0f]">Create New Model</p>
      </Link>
    </div>
  );

  if (models.length === 0) {
    return (
      <section className="w-full py-12">
        <h2 className="text-3xl font-bold mb-8 text-[#0f0f0f] text-center">My Models</h2>
        <div className="max-w-2xl mx-auto text-center mb-8 text-[#373737]">
          You haven’t created any models yet.
        </div>
        {Grid}
      </section>
    );
  }

  return (
    <section className="w-full py-12">
      <h2 className="text-3xl font-bold mb-8 text-[#0f0f0f] text-center">My Models</h2>
      {Grid}
    </section>
  );
}
