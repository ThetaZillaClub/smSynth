// app/model/[id]/page.tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import PrivateHeader from '@/components/header/PrivateHeader';
import type { ModelRow } from '@/lib/client-cache';
import { getImageUrlCached, ensureSessionReady } from '@/lib/client-cache';
import StudentCard from '@/components/student-home/StudentCard';
import { primeActiveStudent } from '@/lib/session/prime';

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

  // Load model row (via API; warmed by primeActiveStudent before nav)
  useEffect(() => {
    let cancelled = false;
    if (!id) return;

    (async () => {
      try {
        setErr(null);
        setLoading(true);
        setCardReady(false);

        const res = await fetch(`/api/students/${encodeURIComponent(id)}`, {
          credentials: 'include',
        });
        const body = await res.json().catch(() => null);
        if (!res.ok) throw new Error(body?.error || `Failed to load (status ${res.status})`);
        if (cancelled) return;
        setM((body ?? null) as ModelRow | null);
      } catch (e) {
        if (cancelled) return;
        const message = e instanceof Error ? e.message : 'Failed to load model.';
        setErr(message);
        setM(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [id]);

  // Pre-sign & preload image; reveal card only when ready
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

  // Build training link with NEW param name
  const sessionId = sp.get('sessionId');
  const trainingHref = sessionId
    ? `/training?student_id=${encodeURIComponent(id)}&sessionId=${encodeURIComponent(sessionId)}`
    : `/training?student_id=${encodeURIComponent(id)}`;

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-b from-[#f0f0f0] to-[#d2d2d2] text-[#0f0f0f]">
      <PrivateHeader />
      <div id="top" className="max-w-5xl mx-auto pt-28 p-6 w-full">
        {loading ? null : err ? (
          <p className="text-red-600 text-center">{err}</p>
        ) : !m ? (
          <p className="text-center text-[#373737]">Model not found.</p>
        ) : (
          <div className="grid grid-cols-1 gap-8">
            <StudentCard
              key={m.id}
              model={m}
              imgUrl={imgUrl}
              trainingHref={trainingHref}
              onPrime={() => primeActiveStudent(id)}   // ← warm cookie + reads before nav
              isReady={cardReady}
            />
          </div>
        )}
      </div>
    </div>
  );
}
