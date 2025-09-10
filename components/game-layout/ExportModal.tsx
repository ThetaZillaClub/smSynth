// components/game-layout/ExportModal.tsx
"use client";
import React from "react";

type TakeLink = { name: string; url: string };

type Props = {
  open: boolean;
  tsvUrl?: string | null;
  tsvName?: string | null;
  takeFiles?: TakeLink[] | null;
  onClose: () => void;
};

export default function ExportModal({ open, tsvUrl, tsvName, takeFiles, onClose }: Props) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-lg">
        <h2 className="text-xl font-semibold mb-2">Training export ready</h2>
        <p className="text-sm text-gray-600 mb-4">
          This includes per-take WAVs and a TSV manifest compatible with PromptSinger.
        </p>

        <div className="space-y-3 max-h-[55vh] overflow-auto pr-2">
          {tsvUrl && (
            <div className="flex items-center justify-between">
              <div className="font-medium">Dataset manifest</div>
              <a className="underline text-blue-700" href={tsvUrl} download={tsvName ?? "dataset.tsv"}>
                Download {tsvName ?? "dataset.tsv"}
              </a>
            </div>
          )}

          {takeFiles?.length ? (
            <div>
              <div className="font-medium mb-1">Take WAVs ({takeFiles.length})</div>
              <ul className="space-y-1">
                {takeFiles.map((t) => (
                  <li key={t.name} className="flex items-center justify-between">
                    <span className="text-sm text-gray-800 truncate">{t.name}</span>
                    <a className="underline text-blue-700 text-sm" href={t.url} download={t.name}>
                      Download
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>

        <div className="mt-4 flex justify-end">
          <button className="px-3 py-1.5 rounded-md border" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
