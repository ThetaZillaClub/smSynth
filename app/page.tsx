// app/page.tsx
// Landing page without the PrimaryHeader — the sidebar shell handles chrome.
// Keep your existing sections; remove the old header + top padding.

import Hero from "@/components/landing/Hero";
import Features from "@/components/landing/Features";
import FaqSection from "@/components/landing/FaqSection";
import Footer from "@/components/footer/Footer";

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col items-center bg-[#f0f0f0] text-[#0f0f0f]">
      <div className="flex-1 w-full flex flex-col gap-20 items-center">
        <Hero />
        <Features />
        <FaqSection />
        <Footer />
      </div>
    </div>
  );
}
