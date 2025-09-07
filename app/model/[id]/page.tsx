// app/model/[id]/page.tsx
'use client';

import { useParams } from 'next/navigation';
import PrimaryHeader from '@/components/header/PrimaryHeader';
import Footer from '@/components/footer/Footer';
import ModelHome from '@/components/model-home/ModelHome';

export default function ModelDetailPage() {
  const params = useParams<{ id: string }>();
  const modelId = params.id;

  return (
    <div className="min-h-screen flex flex-col bg-[#f0f0f0] text-[#0f0f0f]">
      <PrimaryHeader />
      {/* flex-1 lets main occupy the leftover vertical space */}
      <main className="flex-1">
        {/* pt-28 keeps content below the fixed header (h-20) */}
        <div className="max-w-3xl mx-auto pt-28 p-6">
          <ModelHome modelId={modelId} />
        </div>
      </main>
      {/* Override the footer’s default mt-32 to eliminate the gap */}
      <Footer className="mt-0" />
    </div>
  );
}
