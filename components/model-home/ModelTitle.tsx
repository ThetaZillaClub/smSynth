// components/model-home/ModelTitle.tsx
'use client';

export default function ModelTitle({ name }: { name: string }) {
  return (
    <h1 className="text-4xl sm:text-5xl font-bold text-center text-[#0f0f0f]">
      {name}
    </h1>
  );
}
