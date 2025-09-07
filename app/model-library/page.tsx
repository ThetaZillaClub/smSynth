// app/model-library/page.tsx
'use client';

import PrimaryHeader from '@/components/header/PrimaryHeader';
import Footer from '@/components/footer/Footer';
import Library from '@/components/model-library/Library';

export default function ModelLibraryPage() {
  return (
    <div className="min-h-screen flex flex-col bg-[#f0f0f0] text-[#0f0f0f]">
      <PrimaryHeader />
      <main className="flex-1">
        <div className="max-w-5xl mx-auto pt-28 p-6">
          <Library />
        </div>
      </main>
      <Footer className="mt-0" />
    </div>
  );
}
