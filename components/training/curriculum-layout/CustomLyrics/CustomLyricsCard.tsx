// components/training/curriculum-layout/CustomLyrics/CustomLyricsCard.tsx
"use client";
import React from "react";
import Field from "../Field";

export default function CustomLyricsCard({
  value,
  onChange,
}: {
  value: string;
  onChange: (s: string) => void;
}) {
  return (
    <div className="rounded-lg border border-[#d2d2d2] bg-[#ebebeb] p-3">
      <div className="text-[11px] uppercase tracking-wide text-[#6b6b6b] mb-2">
        Custom Lyrics
      </div>
      <Field label="Words (comma-separated)">
        <textarea
          className="w-full min-h-[100px] rounded-md border border-[#d2d2d2] bg-white px-2 py-1 text-sm"
          placeholder="see, the, bright, moon"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
        <div className="text-xs text-[#6b6b6b] mt-1">
          Maps 1:1 to notes. If counts don’t match, we trim/pad with “la”.
        </div>
      </Field>
    </div>
  );
}
