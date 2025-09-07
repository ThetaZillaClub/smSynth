import BeginJourneyButton from '@/components/header/BeginJourneyButton';

export default function Hero() {
  return (
    <div className="flex flex-col items-center justify-center text-center py-20 bg-[#f0f0f0] text-[#0f0f0f]">
      <h1 className="text-5xl md:text-7xl font-bold mb-4">
        Unlock Your Voice Revolution
      </h1>
      <p className="text-xl md:text-2xl mb-8 max-w-2xl">
        Train custom singing models, transform raw audio into stunning vocals with prompts. Gamified creation, copyright-free—join the world's largest singing model hub today.
      </p>
      <BeginJourneyButton />
    </div>
  );
}