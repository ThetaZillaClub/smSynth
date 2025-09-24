'use client';

import { useEffect, useRef, useState } from 'react';

type Props = {
  imgUrl: string | null;
  alt: string;
  /** When true, skip the internal fade and show immediately (card coordinates the fade). */
  visible?: boolean;
};

/** Transparent reserved space; card controls the overall fade. */
export default function StudentImage({ imgUrl, alt, visible = false }: Props) {
  const [loaded, setLoaded] = useState(false);
  const imgRef = useRef<HTMLImageElement | null>(null);

  // Handle cached images (complete+naturalWidth)
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
          className={`
            absolute inset-0 w-full h-full object-cover
            transition-opacity duration-300
            ${show ? 'opacity-100' : 'opacity-0'}
          `}
          onLoad={() => setLoaded(true)}
          decoding="async"
          loading="eager"
          fetchPriority="high"
          draggable={false}
        />
      ) : (
        <div className="absolute inset-0 grid place-items-center text-sm text-[#6b6b6b]">
          No Image
        </div>
      )}
    </div>
  );
}
