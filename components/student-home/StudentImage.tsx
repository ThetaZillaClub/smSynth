'use client';

import { useEffect, useRef, useState } from 'react';

type Props = {
  imgUrl: string | null;
  alt: string;
  /** If true, skip internal fade (the card is doing the unified fade). */
  visible?: boolean;
};

/** Transparent reserved space; outer card controls any visual transition. */
export default function StudentImage({ imgUrl, alt, visible = false }: Props) {
  const [loaded, setLoaded] = useState(false);
  const imgRef = useRef<HTMLImageElement | null>(null);

  // Handle cache hits (instant decode)
  useEffect(() => {
    setLoaded(false);
    const el = imgRef.current;
    if (el && el.complete && el.naturalWidth > 0) setLoaded(true);
  }, [imgUrl]);

  const show = visible || loaded;

  return (
    <div className="relative w-full aspect-square bg-transparent">
      {imgUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          ref={imgRef}
          src={imgUrl}
          alt={alt}
          // No inner fade when `visible` is true → prevents double-fade
          className={[
            'absolute inset-0 w-full h-full object-cover',
            visible ? '' : 'transition-opacity duration-300',
            show ? 'opacity-100' : 'opacity-0',
          ].join(' ')}
          onLoad={() => setLoaded(true)}
          decoding="async"
          loading="eager"
          fetchPriority="high"
          draggable={false}
        />
      ) : (
        <div className="absolute inset-0 grid place-items-center text-sm text-[#6b6b6b]" aria-hidden>
          No Image
        </div>
      )}
    </div>
  );
}
