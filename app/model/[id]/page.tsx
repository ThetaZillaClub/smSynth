// app/model/[id]/page.tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

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

  // Inference
  const [text, setText] = useState('la la la');
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [inferBusy, setInferBusy] = useState(false);
  const [inferErr, setInferErr] = useState<string | null>(null);

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
      } catch { if (mounted) setImgUrl(null); }
    })();
    return () => { mounted = false; };
  }, [m?.image_path, supabase]);

  async function runInference() {
    try {
      setInferErr(null);
      setInferBusy(true);
      setAudioUrl(null);

      const res = await fetch(`/api/models/${id}/infer`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text }),
      });

      if (!res.ok) {
        let msg = `Inference failed (${res.status})`;
        try {
          const j = await res.json();
          if (j?.error) msg = j.error;
        } catch {}
        throw new Error(msg);
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      setAudioUrl(url);
    } catch (e: any) {
      setInferErr(e?.message || String(e));
    } finally {
      setInferBusy(false);
    }
  }

  // Download link (optional ?sessionId=... passthrough)
  const sessionId = sp.get('sessionId');
  const dlHref = sessionId
    ? `/api/models/${id}/latest-ckpt?sessionId=${encodeURIComponent(sessionId)}`
    : `/api/models/${id}/latest-ckpt`;

  return (
    <div className="min-h-screen flex flex-col bg-[#f0f0f0] text-[#0f0f0f]">
      <div className="max-w-5xl mx-auto pt-28 p-6 w-full">
        {loading ? (
          <div className="animate-pulse h-8 w-64 bg-gray-300 rounded" />
        ) : err ? (
          <p className="text-red-600 text-center">{err}</p>
        ) : !m ? (
          <p className="text-center text-[#373737]">Model not found.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
            <div className="bg-[#ebebeb] border border-[#d2d2d2] rounded-lg overflow-hidden">
              <div className="w-full aspect-square bg-gray-300">
                {imgUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={imgUrl} alt={m.name} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full grid place-items-center text-sm text-gray-600">No Image</div>
                )}
              </div>
              <div className="p-4">
                <h1 className="text-2xl font-bold">{m.name}</h1>
                <p className="text-sm text-[#373737] mt-1">by {m.creator_display_name}</p>
                <div className="mt-4 flex gap-3">
                  <a
                    href={dlHref}
                    className="px-4 py-2 rounded-md bg-black text-white hover:opacity-90"
                  >
                    Download latest checkpoint
                  </a>
                </div>
              </div>
            </div>

            <div className="bg-[#ebebeb] border border-[#d2d2d2] rounded-lg p-4">
              <h2 className="text-xl font-semibold mb-3">Try inference</h2>
              <textarea
                className="w-full p-3 rounded-md border border-[#cfcfcf] bg-white text-black min-h-[120px]"
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Type a prompt / lyrics to sing…"
              />
              <div className="mt-3 flex items-center gap-3">
                <button
                  onClick={runInference}
                  disabled={inferBusy || !text.trim()}
                  className="px-4 py-2 rounded-md bg-black text-white disabled:opacity-60"
                >
                  {inferBusy ? 'Synthesizing…' : 'Synthesize'}
                </button>
                {inferErr && <span className="text-red-600 text-sm">{inferErr}</span>}
              </div>

              {audioUrl && (
                <div className="mt-4">
                  <audio src={audioUrl} controls className="w-full" />
                  <div className="mt-2">
                    <a
                      href={audioUrl}
                      download={`${id}-inference.wav`}
                      className="text-sm underline"
                    >
                      Download WAV
                    </a>
                  </div>
                </div>
              )}

              <p className="text-xs text-[#555] mt-4">
                Tip: you can append <code>?sessionId=&lt;uuid&gt;</code> to the page URL to force
                pulling a checkpoint from a specific training session.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
