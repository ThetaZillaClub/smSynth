// components/profile/MyStudents.tsx
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

type ModelRow = {
  id: string;
  name: string;
  image_path: string | null;
};

export default function MyStudents() {
  const [rows, setRows] = useState<ModelRow[]>([]);
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
          setRows([]);
          return;
        }

        // NOTE: still reading from `models`
        const { data, error } = await supabase
          .from('models')
          .select('id,name,image_path')
          .eq('uid', user.id)
          .order('created_at', { ascending: false });

        if (error) throw error;

        const list = data ?? [];
        setRows(list);

        // Signed URLs from the existing `model-images` bucket
        const bucket = supabase.storage.from('model-images');
        const urls: Record<string, string> = {};
        await Promise.all(
          list.map(async (m) => {
            if (!m.image_path) return;
            const { data: signed, error: signErr } = await bucket.createSignedUrl(
              m.image_path,
              60 * 60
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
    return <p className="text-center py-12">Loading your students…</p>;
  }

  const Grid = (
    <div className="flex flex-wrap justify-center gap-8 max-w-4xl mx-auto">
      {rows.map((row) => (
        <Link
          key={row.id}
          // NOTE: detail pages can stay on /model/[id] for now if that's what exists
          href={`/model/${row.id}`}
          className="flex flex-col items-center bg-[#ebebeb] border border-[#d2d2d2] rounded-lg shadow-md hover:shadow-lg transition-shadow basis-[calc(50%-1rem)] max-w-[calc(50%-1rem)] sm:max-w-none"
        >
          <div className="w-full aspect-square bg-gray-300 rounded-t-lg overflow-hidden">
            {imageUrls[row.id] ? (
              <img
                src={imageUrls[row.id]}
                alt={row.name}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full grid place-items-center text-sm text-gray-600">
                No Image
              </div>
            )}
          </div>
          <p className="py-4 text-center font-medium text-[#0f0f0f]">{row.name}</p>
        </Link>
      ))}

      {/* Create New Student tile */}
      <Link
        href="/student-settings"
        className="flex flex-col items-center bg-[#ebebeb] border border-[#d2d2d2] rounded-lg shadow-md hover:shadow-lg transition-shadow basis-[calc(50%-1rem)] max-w-[calc(50%-1rem)] sm:max-w-none"
      >
        <div className="w-full aspect-square bg-gray-200 rounded-t-lg grid place-items-center">
          <span className="flex items-center justify-center w-16 h-16 rounded-full bg-white/70 border border-[#d2d2d2]">
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
        <p className="py-4 text-center font-medium text-[#0f0f0f]">Create New Student</p>
      </Link>
    </div>
  );

  if (rows.length === 0) {
    return (
      <section className="w-full py-12">
        <h2 className="text-3xl font-bold mb-8 text-[#0f0f0f] text-center">My Students</h2>
        <div className="max-w-2xl mx-auto text-center mb-8 text-[#373737]">
          You haven’t created any students yet.
        </div>
        {Grid}
      </section>
    );
  }

  return (
    <section className="w-full py-12">
      <h2 className="text-3xl font-bold mb-8 text-[#0f0f0f] text-center">My Students</h2>
      {Grid}
    </section>
  );
}
