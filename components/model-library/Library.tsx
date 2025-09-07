// components/model-library/Library.tsx
'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import LibraryTitle from './LibraryTitle';
import LibraryGrid from './LibraryGrid';

export type LibraryModel = {
  id: string;
  name: string;
  creator_display_name: string;
  image_path: string | null;
};

export default function Library() {
  const supabase = createClient();
  const [models, setModels] = useState<LibraryModel[]>([]);
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
          .eq('privacy', 'public')
          .order('created_at', { ascending: false });

        if (error) throw error;
        setModels((data ?? []).map((m) => ({
          id: m.id,
          name: m.name,
          creator_display_name: m.creator_display_name,
          image_path: m.image_path ?? null,
        })));
      } catch (e: any) {
        setErr(e?.message ?? 'Failed to load models.');
      } finally {
        setLoading(false);
      }
    })();
  }, [supabase]);

  return (
    <section className="space-y-8">
      <LibraryTitle />
      {loading ? (
        <div className="flex flex-wrap justify-center gap-8 max-w-4xl mx-auto">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="basis-[calc(50%-1rem)] max-w-[calc(50%-1rem)] sm:max-w-none">
              <div className="w-full aspect-square rounded-lg bg-[#e5e5e5] animate-pulse" />
              <div className="mt-3 h-5 w-2/3 rounded bg-[#e9e9e9] animate-pulse mx-auto" />
            </div>
          ))}
        </div>
      ) : err ? (
        <p className="text-center text-red-600">{err}</p>
      ) : (
        <LibraryGrid models={models} />
      )}
    </section>
  );
}
