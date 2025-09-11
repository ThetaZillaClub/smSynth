// hooks/training/useAutoSubmitTraining.ts
"use client";

import { createClient } from "@/lib/supabase/client";

export type TakeLink = { name: string; url: string };

export type UploadAndQueueInput = {
  modelId: string | null;              // must be provided for training
  subjectId: string | null;
  genderLabel: "male" | "female" | null;
  sessionId: string;                    // session UUID from the recorder
  tsvUrl: string;
  tsvName: string;
  takeFiles: TakeLink[];
};

export default function useAutoSubmitTraining() {
  const supabase = createClient();

  async function uploadToStorage(basePath: string, tsvUrl: string, tsvName: string, takes: TakeLink[]) {
    const bucket =
      process.env.NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET ||
      process.env.NEXT_PUBLIC_SUPABASE_BUCKET ||
      "training";

    // fetch Blob from object URLs
    const tsvBlob = await (await fetch(tsvUrl)).blob();
    const wavs = await Promise.all(takes.map(async (t) => ({ name: t.name, blob: await (await fetch(t.url)).blob() })));

    // TSV
    const tsvKey = `${basePath}/${tsvName || "dataset.tsv"}`;
    {
      const { error } = await supabase.storage
        .from(bucket)
        .upload(tsvKey, tsvBlob, { upsert: true, contentType: "text/tab-separated-values" });
      if (error) throw error;
    }

    // WAVs
    const wavKeys: string[] = [];
    for (const w of wavs) {
      const key = `${basePath}/wavs/${w.name}`;
      const { error } = await supabase.storage
        .from(bucket)
        .upload(key, w.blob, { upsert: true, contentType: "audio/wav" });
      if (error) throw error;
      wavKeys.push(key);
    }

    return { bucket, tsvKey, wavKeys };
  }

  async function queueRemoteJob(payload: {
    bucket: string;
    basePath: string;   // "<modelId>/<sessionId>"
    tsvKey: string;
    wavKeys: string[];
    modelId: string;
    sessionId: string;
    subjectId: string | null;
    genderLabel: "male" | "female" | null;
  }) {
    const res = await fetch("/api/training/queue", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json() as Promise<{ ok: true; jobId: string; remoteDir: string; started?: boolean }>;
  }

  /** Upload TSV+WAVs to Storage → tell GPU node to fetch via signed URLs → start training */
  async function uploadAndQueue(input: UploadAndQueueInput) {
    if (!input.modelId) {
      throw new Error("No model selected. Create a model in Model Settings first.");
    }
    const basePath = `${input.modelId}/${input.sessionId}`;
    const { bucket, tsvKey, wavKeys } = await uploadToStorage(basePath, input.tsvUrl, input.tsvName, input.takeFiles);

    return queueRemoteJob({
      bucket,
      basePath,
      tsvKey,
      wavKeys,
      modelId: input.modelId,
      sessionId: input.sessionId,
      subjectId: input.subjectId,
      genderLabel: input.genderLabel,
    });
  }

  return { uploadAndQueue };
}
