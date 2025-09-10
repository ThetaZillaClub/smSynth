"use client";
import React, { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function StorageTestPage() {
  const sb = createClient();
  const [out, setOut] = useState("");

  async function run() {
    setOut("Working...");
    const bucket = process.env.NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET || "training";
    const key = `smoke/${Date.now()}.txt`;
    const blob = new Blob(["hello storage"], { type: "text/plain" });

    const { error: upErr } = await sb.storage.from(bucket).upload(key, blob, { upsert: true });
    if (upErr) { setOut("Upload error: " + upErr.message); return; }

    const { data: sig, error: sigErr } = await sb.storage.from(bucket).createSignedUrl(key, 60);
    if (sigErr) { setOut("Signed URL error: " + sigErr.message); return; }

    setOut(`OK! key=${key}\nSigned URL (60s):\n${sig.signedUrl}`);
  }

  return (
    <div style={{ padding: 20 }}>
      <h1>Storage Smoke Test</h1>
      <button onClick={run} style={{ padding: 8, border: "1px solid #ccc", borderRadius: 8 }}>
        Run test
      </button>
      <pre style={{ whiteSpace: "pre-wrap", marginTop: 12 }}>{out}</pre>
    </div>
  );
}
