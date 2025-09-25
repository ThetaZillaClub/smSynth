// components/training/curriculum-layout/ImportMidi/ImportMidiCard.tsx
"use client";
import React from "react";

export default function ImportMidiCard({
  hasPhrase,
  onFile,
  onClear,
}: {
  hasPhrase: boolean;
  onFile: (file: File) => void;
  onClear: () => void;
}) {
  const inputId = React.useId();
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = React.useState<string>("");

  return (
    <div className="rounded-lg border border-[#d2d2d2] bg-[#ebebeb] p-3">
      <div className="text-[11px] uppercase tracking-wide text-[#6b6b6b] mb-2">
        Import MIDI (optional)
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {/* Visually hidden native input */}
        <input
          id={inputId}
          ref={fileInputRef}
          type="file"
          accept=".mid,.midi"
          className="sr-only"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) {
              setFileName(f.name);
              onFile(f);
            } else {
              setFileName("");
            }
          }}
        />

        {/* Trigger (matches Start session) */}
        <label
          htmlFor={inputId}
          className="px-3 py-1.5 rounded-md border border-[#d2d2d2] bg-[#f0f0f0] text-[#0f0f0f] text-sm hover:bg-white transition shadow-sm cursor-pointer select-none"
          title="Choose a .mid or .midi file"
        >
          Choose MIDI
        </label>

        {/* Selected filename */}
        {fileName ? (
          <span
            className="text-xs text-[#2d2d2d] truncate max-w-[18rem]"
            title={fileName}
          >
            {fileName}
          </span>
        ) : null}

        {/* Clear */}
        {hasPhrase ? (
          <button
            type="button"
            className="px-2 py-1 rounded-md bg-white border border-[#d2d2d2] text-sm"
            onClick={() => {
              setFileName("");
              onClear();
              if (fileInputRef.current) fileInputRef.current.value = "";
            }}
          >
            Clear
          </button>
        ) : null}
      </div>

      <div className="text-[11px] text-[#6b6b6b] mt-1">
        Reads Type 0/1, tempo changes, melody line (highest note when chords occur), and karaoke lyrics.
      </div>
    </div>
  );
}
