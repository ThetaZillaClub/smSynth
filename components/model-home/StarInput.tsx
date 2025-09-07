// components/model-home/StarInput.tsx
'use client';
import { useMemo } from 'react';

export default function StarInput({
  value,
  onChange,
  size = 28,
}: {
  value: number;
  onChange: (v: number) => void;
  size?: number;
}) {
  const stars = useMemo(() => [1, 2, 3, 4, 5], []);
  return (
    <div
      className="flex items-center justify-center gap-1"
      role="radiogroup"
      aria-label="Rate this model"
    >
      {stars.map((s) => (
        <button
          key={s}
          type="button"
          role="radio"
          aria-checked={value === s}
          onClick={() => onChange(s)}
          className="p-1 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0f0f0f]/20 transition-transform hover:scale-105"
          title={`${s} star${s > 1 ? 's' : ''}`}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            width={size}
            height={size}
            className={s <= value ? 'text-yellow-500' : 'text-gray-400'}
            fill="currentColor"
            aria-hidden="true"
          >
            <path d="M10 15.27l-5.18 3.05L6 12.97 1.64 9.24l5.19-.45L10 4l3.17 4.79 5.19.45L14 12.97l1.18 5.35z" />
          </svg>
        </button>
      ))}
    </div>
  );
}
