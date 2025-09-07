// components/model-home/ModelMeta.tsx
'use client';

function labelize(s: string) {
  // 'unspecified' -> 'Unspecified', 'public' -> 'Public'
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export default function ModelMeta({
  creatorName,
  gender,
  privacy,
}: {
  creatorName: string;
  gender: 'male' | 'female' | 'other' | 'unspecified';
  privacy: 'public' | 'private';
}) {
  return (
    <section className="w-full rounded-lg border border-[#d2d2d2] bg-[#ebebeb] p-6">
      {/* Center the contents within each grid cell */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 place-items-center">
        <div className="text-center">
          <div className="text-xs uppercase tracking-wide text-[#6b6b6b]">Model Creator</div>
          <div className="text-base font-medium text-[#0f0f0f] break-words">{creatorName}</div>
        </div>

        <div className="text-center">
          <div className="text-xs uppercase tracking-wide text-[#6b6b6b]">Gender</div>
          <div className="text-base font-medium text-[#0f0f0f]">{labelize(gender)}</div>
        </div>

        <div className="text-center">
          <div className="text-xs uppercase tracking-wide text-[#6b6b6b]">Privacy</div>
          <div className="text-base font-medium text-[#0f0f0f]">{labelize(privacy)}</div>
        </div>
      </div>
    </section>
  );
}
