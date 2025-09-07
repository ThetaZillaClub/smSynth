// components/model-settings/ModelSettingsForm.tsx
'use client';

import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import GenderSettings from './GenderSettings';
import PrivacySettings from './PrivacySettings';
import SubmitButton from './SubmitButton';

type Privacy = 'public' | 'private';
type Gender = 'male' | 'female' | 'other' | 'unspecified';

export default function ModelSettingsForm() {
  const supabase = createClient();
  const router = useRouter();

  const [name, setName] = useState('');
  const [gender, setGender] = useState<Gender>('unspecified');
  const [privacy, setPrivacy] = useState<Privacy>('private');
  const [image, setImage] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const onDrop = useCallback((accepted: File[]) => {
    setImage(accepted?.[0] ?? null);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/*': [] },
    multiple: false,
  });

  const looksLikeMissingBucket = (e: unknown) => {
    const msg = (e as { message?: string })?.message?.toLowerCase?.() ?? '';
    // Common storage error strings when the bucket id is wrong or missing
    return msg.includes('bucket') && msg.includes('not') && msg.includes('found');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const { data: userRes, error: userErr } = await supabase.auth.getUser();
      if (userErr) throw userErr;
      const user = userRes.user;
      if (!user) throw new Error('You must be logged in.');

      const uid = user.id;
      const displayName =
        (user.user_metadata?.display_name as string | undefined)?.trim() ||
        (user.email?.split('@')?.[0] || 'Singer');

      // 1) Upload image if present (path: <uid>/<timestamp>_<filename>)
      let imagePath: string | null = null;
      if (image) {
        const objectName = `${uid}/${Date.now()}_${image.name}`;

        const { error: uploadError } = await supabase
          .storage
          .from('model-images') // ensure bucket id is exactly this
          .upload(objectName, image, { upsert: false, cacheControl: '3600' });

        if (uploadError) {
          if (looksLikeMissingBucket(uploadError)) {
            throw new Error(
              'The "model-images" bucket was not found in this Supabase project. Check the bucket ID and your NEXT_PUBLIC_SUPABASE_URL/key.'
            );
          }
          throw uploadError;
        }
        imagePath = objectName;
      }

      // 2) Insert model row (DB default sets uid := auth.uid(), but passing is fine)
      const { error: insertError } = await supabase.from('models').insert({
        uid,
        creator_display_name: displayName,
        name,
        gender,
        privacy,
        image_path: imagePath,
      });
      if (insertError) throw insertError;

      // 3) Reset and redirect
      setName('');
      setGender('unspecified');
      setPrivacy('private');
      setImage(null);
      router.push('/training');
    } catch (err: unknown) {
      setError((err as { message?: string })?.message ?? 'Something went wrong.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      <div className="grid gap-2">
        <Label htmlFor="name" className="text-[#0f0f0f] font-medium">Name</Label>
        <Input
          id="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          minLength={1}
          maxLength={100}
          className="h-10 rounded-md bg-[#ebebeb] text-[#0f0f0f] border border-[#d2d2d2] focus:border-[#0f0f0f] focus:ring-0"
        />
      </div>

      <GenderSettings value={gender} onChange={(v) => setGender(v as Gender)} />
      <PrivacySettings value={privacy} onChange={(v) => setPrivacy(v as Privacy)} />

      <div className="grid gap-2">
        <Label className="text-[#0f0f0f] font-medium">Image</Label>
        <div
          {...getRootProps()}
          className={`border-2 border-dashed border-[#d2d2d2] rounded-md p-6 text-center cursor-pointer ${isDragActive ? 'bg-[#ebebeb]' : ''}`}
        >
          <input {...getInputProps()} />
          <p className="text-[#373737]">
            {image ? image.name : "Drag 'n' drop an image here, or click to select"}
          </p>
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex justify-center">
        <SubmitButton isLoading={isLoading} />
      </div>
    </form>
  );
}
