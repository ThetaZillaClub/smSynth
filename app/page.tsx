import PrimaryHeader from "@/components/header/PrimaryHeader";
import Hero from "@/components/hero/Hero";
import Footer from "@/components/footer/Footer";

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col items-center bg-[#f0f0f0] text-[#0f0f0f]">
      <PrimaryHeader />
      <div className="flex-1 w-full flex flex-col items-center pt-20">
        <Hero />
        <Footer className="mt-auto w-full" />
      </div>
    </main>
  );
}