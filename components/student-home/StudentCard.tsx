'use client';

import type { ModelRow } from '@/lib/client-cache';
import StudentImage from './StudentImage';
import StudentMeta from './StudentMeta';
import StudentLaunchButton from './StudentLaunchButton';

type Props = {
  model: ModelRow;
  imgUrl: string | null;
  trainingHref: string;
  onPrime: () => void;
  isReady?: boolean; // driven by page.tsx after image preload
};

export default function StudentCard({
  model,
  imgUrl,
  trainingHref,
  onPrime,
  isReady = false,
}: Props) {
  return (
    <div
      data-ready={isReady ? '1' : '0'}
      aria-busy={!isReady}
      className={`
        bg-[#ebebeb] border border-[#d2d2d2] rounded-lg overflow-hidden
        shadow-[0_10px_24px_rgba(15,15,15,0.08)]
        transition-opacity duration-1000 will-change-[opacity]
        ${isReady ? 'opacity-100' : 'opacity-0 pointer-events-none select-none'}
      `}
    >
      {/* Make the image instantly visible when the card isReady */}
      <StudentImage imgUrl={imgUrl} alt={model.name} visible={isReady} />

      <StudentMeta
        name={model.name}
        creatorName={model.creator_display_name}
        privacy={model.privacy}
      />

      <div className="px-4 pb-4">
        <StudentLaunchButton href={trainingHref} onPrime={onPrime} />
      </div>
    </div>
  );
}
