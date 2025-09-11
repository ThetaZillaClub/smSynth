// components/game-layout/ExportModal.tsx
"use client";
import React, { useCallback, useMemo, useState } from "react";

export type TakeLink = { name: string; url: string };

type Props = {
  open: boolean;
  tsvUrl?: string | null;
  tsvName?: string | null;
  takeFiles?: TakeLink[] | null;
  onClose: () => void;

  // OPTIONAL: if you want the modal to perform the queue call itself,
  // provide either basePath ("<modelId>/<sessionId>") OR both modelId & sessionId.
  basePath?: string;
  modelId?: string;
  sessionId?: string;

  // OPTIONAL: if not provided, uses NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET
  bucket?: string;

  // OPTIONAL overrides (if your keys differ from defaults)
  tsvKey?: string;      // defaults to `${basePath}/${tsvName ?? "dataset.tsv"}`
  wavKeys?: string[];   // defaults to `${basePath}/wavs/<takeName>`

  // OPTIONAL metadata
  subjectId?: string | null;
  genderLabel?: "male" | "female" | null;

  // If you want to keep controlling from parent, you still can:
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

  // new optional inputs for self-queue
  basePath,
  modelId,
  sessionId,
  bucket: bucketProp,
  tsvKey: tsvKeyProp,
  wavKeys: wavKeysProp,
  subjectId,
  genderLabel,

  // existing external-control hooks (remain supported)
  onQueue,
  queueing: queueingProp,
  queueError: queueErrorProp,
  jobInfo: jobInfoProp,
}: Props) {
  const DEFAULT_BUCKET = process.env.NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET;

  // If parent supplies control, use those; else use internal state.
  const [queueingInternal, setQueueingInternal] = useState(false);
  const [queueErrorInternal, setQueueErrorInternal] = useState<string | null>(null);
  const [jobInfoInternal, setJobInfoInternal] = useState<{ jobId: string; remoteDir: string; started?: boolean } | null>(null);

  const queueing = queueingProp ?? queueingInternal;
  const queueError = queueErrorProp ?? queueErrorInternal;
  const jobInfo = jobInfoProp ?? jobInfoInternal;

  const effectiveBasePath = useMemo(() => {
    if (basePath) return basePath.replace(/^\/+|\/+$/g, "");
    if (modelId && sessionId) return `${modelId}/${sessionId}`;
    return null;
  }, [basePath, modelId, sessionId]);

  const bucket = bucketProp || DEFAULT_BUCKET;

  const tsvKey = useMemo(() => {
    if (tsvKeyProp) return tsvKeyProp;
    if (!effectiveBasePath) return null;
    const file = (tsvName && tsvName.trim()) || "dataset.tsv";
    return `${effectiveBasePath}/${file}`;
  }, [tsvKeyProp, effectiveBasePath, tsvName]);

  const wavKeys = useMemo(() => {
    if (wavKeysProp) return wavKeysProp;
    if (!effectiveBasePath) return null;
    const names = (takeFiles || []).map((t) => t.name).filter(Boolean);
    if (!names.length) return [];
    return names.map((n) => `${effectiveBasePath}/wavs/${n}`);
  }, [wavKeysProp, effectiveBasePath, takeFiles]);

  const canSelfQueue =
    !onQueue && // only self-queue when parent didn't provide a handler
    Boolean(bucket) &&
    Boolean(effectiveBasePath) &&
    Boolean(tsvKey) &&
    Array.isArray(wavKeys) &&
    wavKeys!.length > 0 &&
    // if basePath came from model/session, make sure both are present
    ((Boolean(basePath) && true) || (Boolean(modelId) && Boolean(sessionId)));

  const handleQueueInternal = useCallback(async () => {
    if (!canSelfQueue) return; // guard
    setQueueingInternal(true);
    setQueueErrorInternal(null);
    setJobInfoInternal(null);

    try {
      // modelId/sessionId: prefer explicit, else derive from basePath
      let mid = modelId;
      let sid = sessionId;

      if ((!mid || !sid) && effectiveBasePath) {
        const parts = effectiveBasePath.split("/");
        if (parts.length >= 2) {
          mid = parts[0];
          sid = parts[1];
        }
      }

      if (!bucket) throw new Error("Missing storage bucket (prop or NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET).");
      if (!effectiveBasePath) throw new Error("Missing basePath (or both modelId and sessionId).");
      if (!mid || !sid) throw new Error("Missing modelId/sessionId (could not derive from basePath).");
      if (!tsvKey) throw new Error("Missing tsvKey (unable to infer).");
      if (!wavKeys || wavKeys.length === 0) throw new Error("Missing wavKeys (no takes present).");

      const payload = {
        bucket,
        basePath: effectiveBasePath,
        tsvKey,
        wavKeys,
        modelId: mid,
        sessionId: sid,
        subjectId: subjectId ?? null,
        genderLabel: genderLabel ?? null,
      };

      const res = await fetch("/api/training/queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || `Queue failed (HTTP ${res.status})`);
      }
      setJobInfoInternal({
        jobId: data.jobId || "",
        remoteDir: data.remoteDir || "",
        started: !!data.started,
      });
    } catch (e: any) {
      setQueueErrorInternal(e?.message || String(e));
    } finally {
      setQueueingInternal(false);
    }
  }, [bucket, canSelfQueue, effectiveBasePath, genderLabel, modelId, sessionId, subjectId, tsvKey, wavKeys]);

  if (!open) return null;

  // decide which queue handler to trigger on button click
  const onQueueClick = onQueue ?? (canSelfQueue ? handleQueueInternal : undefined);

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
                onClick={onQueueClick}
                disabled={!onQueueClick || !tsvUrl || !takeFiles?.length || queueing}
              >
                {queueing ? "Uploading…" : "Upload & Queue Training"}
              </button>
              <button className="px-3 py-1.5 rounded-md border" onClick={onClose}>
                Close
              </button>
            </div>

            {/* Self-queue diagnostic (optional visibility) */}
            {!onQueue && (
              <div className="mt-2 text-xs text-gray-500 space-y-1">
                <div>Bucket: <code>{bucket || "(unset)"}</code></div>
                <div>Base path: <code className="break-all">{effectiveBasePath || "(unset)"}</code></div>
                <div>TSV key: <code className="break-all">{tsvKey || "(unset)"}</code></div>
                <div>WAV keys: <code className="break-all">{(wavKeys && wavKeys.length) ? `${wavKeys.length} files` : "(none)"}</code></div>
              </div>
            )}

            {queueError ? (
              <p className="mt-2 text-red-600 text-sm break-words">{queueError}</p>
            ) : null}

            {jobInfo ? (
              <div className="mt-2 text-sm text-green-700">
                <div>Queued ✓</div>
                {jobInfo.jobId ? <div>Job: <code>{jobInfo.jobId}</code></div> : null}
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
