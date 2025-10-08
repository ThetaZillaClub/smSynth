// app/page.tsx
import Hero from "@/components/landing/Hero";
import Features from "@/components/landing/Features";
import FaqSection from "@/components/landing/FaqSection";
import Footer from "@/components/home/Footer";

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col items-center bg-[#f0f0f0] text-[#0f0f0f]">
      <div className="flex-1 w-full flex flex-col items-center">
        <Hero />
        <Features />
        <FaqSection />
        <Footer />
      </div>
    </div>
  );
}
