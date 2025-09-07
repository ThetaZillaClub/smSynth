import PrimaryHeader from "@/components/header/PrimaryHeader";
import Hero from "@/components/hero/Hero";
import FaqSection from "@/components/faq/FaqSection";
import Footer from "@/components/footer/Footer";

export default function Home() {
  const faqItems = [
    { question: "What is smSynth?", answer: "smSynth is a gamified app that allows users to train custom singing models and convert raw audio into vocals using prompts, creating copyright-free voices." },
    { question: "How do I start training a model?", answer: "Sign up for an account, upload your audio data, and follow the guided steps to finetune your model in a fun, interactive way." },
    { question: "Is smSynth free to use?", answer: "We offer a free tier with basic features. Premium subscriptions unlock advanced training options and unlimited model creation." },
    { question: "Can I share my models?", answer: "Yes, you can make your models public or keep them private. Public models contribute to our growing hub of singing voices." },
    { question: "What makes smSynth unique?", answer: "Our gamified approach makes model training engaging, and all models are ensured to be copyright-free through our platform." }
  ];

  return (
    <main className="min-h-screen flex flex-col items-center bg-[#f0f0f0] text-[#0f0f0f]">
      <PrimaryHeader />
      <div className="flex-1 w-full flex flex-col gap-20 items-center pt-20">
        <Hero />
        <FaqSection items={faqItems} />
        <Footer />
      </div>
    </main>
  );
}