// app/page.tsx
import PrimaryHeaderServer from "@/components/header/PrimaryHeaderServer";
import Hero from "@/components/landing/Hero";
import Features from "@/components/landing/Features";
import FaqSection from "@/components/landing/FaqSection";
import Footer from "@/components/footer/Footer";

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col items-center bg-[#f0f0f0] text-[#0f0f0f]">
      {/* Public: no server auth call, no warning */}
      <PrimaryHeaderServer />
      <div className="flex-1 w-full flex flex-col gap-20 items-center pt-20">
        <Hero />
        <Features />
        <FaqSection />
        <Footer />
      </div>
    </main>
  );
}
