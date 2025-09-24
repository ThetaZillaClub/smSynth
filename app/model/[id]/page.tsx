'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import PrivateHeader from '@/components/header/PrivateHeader';
import type { ModelRow } from '@/lib/client-cache';
import { getImageUrlCached, ensureSessionReady } from '@/lib/client-cache';
import StudentCard from '@/components/student-home/StudentCard';

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
  const [cardReady, setCardReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const primeActiveStudent = useCallback((modelId: string) => {
    try {
      void fetch('/api/session/active-student', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: modelId }),
        keepalive: true,
      });
    } catch {}
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!id) return;

    (async () => {
      try {
        setErr(null);
        setLoading(true);
        setCardReady(false);

        const res = await fetch(`/api/student-session/${encodeURIComponent(id)}`, {
          credentials: 'include',
        });
        const body = await res.json().catch(() => null);
        if (!res.ok) {
          throw new Error(body?.error || `Failed to load (status ${res.status})`);
        }
        if (cancelled) return;
        setM((body ?? null) as ModelRow | null);
      } catch (e: any) {
        if (cancelled) return;
        setErr(e?.message ?? 'Failed to load model.');
        setM(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [id]);

  // Resolve & preload the image; don’t reveal card bg until ready.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      setCardReady(false);

      if (!m) { setImgUrl(null); setCardReady(true); return; }
      if (!m.image_path) { setImgUrl(null); setCardReady(true); return; }

      await ensureSessionReady(supabase, 2500);
      const url = await getImageUrlCached(supabase, m.image_path);
      if (cancelled) return;

      setImgUrl(url ?? null);
      if (!url) { setCardReady(true); return; }

      const img = new Image();
      img.decoding = 'async';
      img.onload = () => { if (!cancelled) setCardReady(true); };
      img.onerror = () => { if (!cancelled) setCardReady(true); };
      img.src = url;
      if (img.complete && img.naturalWidth > 0) setCardReady(true);
    })();

    return () => { cancelled = true; };
  }, [m, supabase]);

  const sessionId = sp.get('sessionId');
  const trainingHref = sessionId
    ? `/training?model_id=${encodeURIComponent(id)}&sessionId=${encodeURIComponent(sessionId)}`
    : `/training?model_id=${encodeURIComponent(id)}`;

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-b from-[#f0f0f0] to-[#d2d2d2] text-[#0f0f0f]">
      <PrivateHeader />
      <div id="top" className="max-w-5xl mx-auto pt-28 p-6 w-full">
        {loading ? (
          null
        ) : err ? (
          <p className="text-red-600 text-center">{err}</p>
        ) : !m ? (
          <p className="text-center text-[#373737]">Model not found.</p>
        ) : (
          <div className="grid grid-cols-1 gap-8">
            <StudentCard
              model={m}
              imgUrl={imgUrl}
              trainingHref={trainingHref}
              onPrime={() => primeActiveStudent(id)}
              isReady={cardReady}            // ⬅️ tell the card when to show its gray bg
            />
          </div>
        )}
      </div>
    </div>
  );
}
