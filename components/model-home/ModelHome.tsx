'use client';

import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import ModelTitle from './ModelTitle';
import ModelImage from './ModelImage';
import ModelMeta from './ModelMeta';
import RateModel from './RateModel';

type Gender = 'male' | 'female' | 'other' | 'unspecified';
type Privacy = 'public' | 'private';

type ModelRow = {
  id: string;
  name: string;
  creator_display_name: string;
  gender: Gender;
  privacy: Privacy;
  image_path: string | null;
};

export default function ModelHome({ modelId }: { modelId: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [model, setModel] = useState<ModelRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        setErr(null);
        setLoading(true);
        const { data, error } = await supabase
          .from('models')
          .select('id,name,creator_display_name,gender,privacy,image_path')
          .eq('id', modelId)
          .maybeSingle();

        if (error) throw error;
        if (!data) {
          setErr('Model not found or you do not have access.');
          setModel(null);
          return;
        }
        setModel(data as ModelRow);
      } catch (e: any) {
        setErr(e?.message ?? 'Failed to load model.');
      } finally {
        setLoading(false);
      }
    })();
  }, [modelId, supabase]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-10 w-2/3 mx-auto rounded-md bg-[#e5e5e5] animate-pulse" />
        <div className="w-full aspect-square rounded-lg bg-[#e5e5e5] animate-pulse" />
        <div className="h-24 rounded-md bg-[#e9e9e9] animate-pulse" />
      </div>
    );
  }

  if (err) return <div className="text-center text-red-600">{err}</div>;
  if (!model) return null;

  return (
    <div className="space-y-8">
      <ModelTitle name={model.name} />
      <ModelImage imagePath={model.image_path} alt={model.name} />
      <ModelMeta
        creatorName={model.creator_display_name}
        gender={model.gender}
        privacy={model.privacy}
      />
      <section>
        <RateModel modelId={model.id} />
      </section>
    </div>
  );
}
