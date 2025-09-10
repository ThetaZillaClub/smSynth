// components/game-layout/ExportModal.tsx
"use client";
import React from "react";

export type TakeLink = { name: string; url: string };

type Props = {
  open: boolean;
  tsvUrl?: string | null;
  tsvName?: string | null;
  takeFiles?: TakeLink[] | null;
  onClose: () => void;

  // NEW: queue controls
  onQueue?: () => void;
  queueing?: boolean;
  queueError?: string | null;
  jobInfo?: { jobId: string; remoteDir: string; started?: boolean } | null;
};

export default function ExportModal({
  open,
  tsvUrl,
  tsvName,
  takeFiles,
  onClose,
  onQueue,
  queueing,
  queueError,
  jobInfo,
}: Props) {
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

          <div className="pt-2 border-t">
            <div className="flex items-center justify-between gap-3">
              <button
                className="px-3 py-1.5 rounded-md border bg-black text-white disabled:opacity-50"
                onClick={onQueue}
                disabled={!onQueue || !tsvUrl || !takeFiles?.length || queueing}
              >
                {queueing ? "Uploading…" : "Upload & Queue Training"}
              </button>
              <button className="px-3 py-1.5 rounded-md border" onClick={onClose}>
                Close
              </button>
            </div>

            {queueError ? (
              <p className="mt-2 text-red-600 text-sm break-words">{queueError}</p>
            ) : null}

            {jobInfo ? (
              <div className="mt-2 text-sm text-green-700">
                <div>Queued ✓</div>
                <div>Job: <code>{jobInfo.jobId}</code></div>
                <div>Remote dir: <code className="break-all">{jobInfo.remoteDir}</code></div>
                {jobInfo.started ? <div>Trainer auto-started on node.</div> : <div>Ready to train on node.</div>}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
