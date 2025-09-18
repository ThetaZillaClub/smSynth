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

        {/* Styled trigger that flips the colors (dark bg, light text) */}
        <label
          htmlFor={inputId}
          className="px-3 py-2 rounded-md text-sm cursor-pointer select-none
                     border border-[#0f0f0f] bg-[#0f0f0f] text-white
                     hover:bg-[#2d2d2d] transition
                     focus:outline-none focus:ring-2 focus:ring-[#0f0f0f]/50"
          title="Choose a .mid or .midi file"
        >
          Choose MIDI
        </label>

        {/* Chosen file name (if any) */}
        {fileName ? (
          <span className="text-xs text-[#2d2d2d] truncate max-w-[18rem]" title={fileName}>
            {fileName}
          </span>
        ) : null}

        {/* Clear button (kept light style) */}
        {hasPhrase ? (
          <button
            type="button"
            className="px-2 py-1 rounded-md bg-white border border-[#d2d2d2] text-sm"
            onClick={() => {
              setFileName("");
              onClear();
              // also clear the input's file selection for a clean slate
              if (fileInputRef.current) fileInputRef.current.value = "";
            }}
          >
            Clear
          </button>
        ) : null}
      </div>

      <div className="text-xs text-[#6b6b6b] mt-1">
        Reads Type 0/1, tempo changes, melody line (highest note when chords occur), and karaoke lyrics.
      </div>
    </div>
  );
}
