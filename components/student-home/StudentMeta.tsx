type Props = {
  name: string;
  creatorName: string;
  privacy: 'public' | 'private';
};

export default function StudentMeta({ name, creatorName, privacy }: Props) {
  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold">{name}</h1>
      <p className="text-sm text-[#373737] mt-1">by {creatorName}</p>

      <div className="mt-2">
        <span className="inline-block text-xs rounded-full border border-[#cfcfcf] px-2 py-0.5 text-[#373737]">
          {privacy === 'public' ? 'Public' : 'Private'}
        </span>
      </div>
    </div>
  );
}
