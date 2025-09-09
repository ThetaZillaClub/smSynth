// components/game-layout/ExportModal.tsx
"use client";
import React from "react";

type Props = {
  open: boolean;
  wavUrl?: string;
  jsonUrl?: string;
  onClose: () => void;
};

export default function ExportModal({ open, wavUrl, jsonUrl, onClose }: Props) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md">
        <h2 className="text-xl font-semibold mb-2">Training complete</h2>
        <p className="text-sm text-gray-600 mb-4">
          Combined session files for validation. In production, this will upload automatically.
        </p>
        <div className="flex flex-col gap-2">
          {wavUrl && (
            <a className="underline text-blue-700" href={wavUrl} download="session.wav">
              Download combined WAV
            </a>
          )}
          {jsonUrl && (
            <a className="underline text-blue-700" href={jsonUrl} download="session.json">
              Download combined JSON
            </a>
          )}
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
