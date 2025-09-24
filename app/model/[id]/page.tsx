'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import PrimaryHeader from '@/components/header/PrimaryHeader';
import type { ModelRow } from '@/lib/client-cache';
import { getImageUrlCached } from '@/lib/client-cache';

export default function ModelDetailPage() {
  const params = useParams();
  const id =
    typeof params?.id === 'string'
      ? params.id
      : Array.isArray(params?.id)
      ? params.id[0]
      : '';
  const sp = useSearchParams();
  const supabase = useMemo(() => createClient(), []);
  const [m, setM] = useState<ModelRow | null>(null);
  const [imgUrl, setImgUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  // Fire-and-forget: prime the active-student cookie on click/tap/new-tab
  const primeActiveStudent = useCallback((modelId: string) => {
    try {
      // keepalive so it survives navigation/new-tab
      void fetch('/api/session/active-student', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: modelId }),
        keepalive: true,
      });
    } catch {
      // swallow — this is a hint, not a blocker
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!id) return;

    (async () => {
      try {
        setErr(null);
        setLoading(true);

        // Use server route so RLS + cookies are respected (no client auth race)
        const res = await fetch(`/api/student-session/${encodeURIComponent(id)}`, {
          credentials: 'include',
        });

        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error(j?.error || `Failed to load (status ${res.status})`);
        }

        const data = (await res.json()) as ModelRow;
        if (cancelled) return;
        setM(data ?? null);
      } catch (e: any) {
        if (cancelled) return;
        setErr(e?.message ?? 'Failed to load model.');
        setM(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [id]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!m?.image_path) {
        setImgUrl(null);
        return;
      }
      const url = await getImageUrlCached(supabase, m.image_path);
      if (!cancelled) setImgUrl(url);
    })();
    return () => {
      cancelled = true;
    };
  }, [m?.image_path, supabase]);

  const sessionId = sp.get('sessionId');
  const trainingHref = sessionId
    ? `/training?model_id=${encodeURIComponent(id)}&sessionId=${encodeURIComponent(sessionId)}`
    : `/training?model_id=${encodeURIComponent(id)}`;

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-b from-[#f0f0f0] to-[#d2d2d2] text-[#0f0f0f]">
      {/* Header (no forced initialAuthed) */}
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
                  <img
                    src={imgUrl}
                    alt={m.name}
                    className="w-full h-full object-cover"
                    loading="lazy"
                    decoding="async"
                    fetchPriority="low"
                  />
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
                  <Link
                    href={trainingHref}
                    prefetch
                    className="px-4 py-2 rounded-md border border-[#d2d2d2] bg-[#f0f0f0] text-[#0f0f0f] hover:bg-white transition"
                    onMouseDown={() => primeActiveStudent(id)}
                    onTouchStart={() => primeActiveStudent(id)}
                    onAuxClick={() => primeActiveStudent(id)} // middle-click new tab
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') primeActiveStudent(id);
                    }}
                  >
                    Launch Training
                  </Link>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
