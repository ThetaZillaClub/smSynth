// hooks/training/useSessionPackager.ts
"use client";

import { useCallback, useRef, useState } from "react";
import type { Phrase } from "@/components/piano-roll/types";
import { buildTakeV2 } from "@/utils/take/buildTakeV2";
import { encodeWavPCM16 } from "@/utils/audio/wav";
import { buildDatasetTsv } from "@/utils/tsv/buildDatasetTsv";

type Traces = { hzArr: (number | null)[]; confArr: number[]; rmsDbArr: number[]; fps: number };
type AudioMeta = {
  sampleRateOut: number;
  numSamplesOut: number | null;
  durationSec: number;
  deviceSampleRateHz: number | null;
  baseLatencySec: number | null;
  workletBufferSize: number | null;
  resampleMethod: "fir-decimate" | "linear";
  pcmView: Float32Array | null;
  metrics: { rmsDb: number; maxAbs: number; clippedPct: number } | null;
};
type PromptMeta = {
  a4Hz: number;
  lowHz: number | null;
  highHz: number | null;
  leadInSec: number;
  bpm: number;
  lyricStrategy: "mixed" | "stableVowel";
  lyricSeed: number;
  scale: string;
};
type TimingMeta = { playStartMs: number | null; recStartMs: number | null };
type ControlsMeta = { genderLabel: "male" | "female" | null };

export default function useSessionPackager(opts: {
  appBuild: string;
  sessionId: string;
  modelId?: string | null; // for unique TSV filename
}) {
  const { appBuild, sessionId, modelId } = opts;

  // counts for guard/UI
  const [packagedCount, setPackagedCount] = useState(0);
  const [inFlight, setInFlight] = useState(0);

  // aggregate data
  const pcmChunksRef = useRef<Float32Array[]>([]);
  const sampleCountsRef = useRef<number[]>([]);
  const takesRef = useRef<any[]>([]);

  // Per-take snapshots (takeId -> { phrase, words })
  const pendingRef = useRef<Map<string, { phrase: Phrase; words: string[] }>>(new Map());

  // export urls
  const [tsvUrl, setTsvUrl] = useState<string | null>(null);
  const [tsvName, setTsvName] = useState<string | null>(null);
  const [takeUrls, setTakeUrls] = useState<{ name: string; url: string }[] | null>(null);
  const [showExport, setShowExport] = useState(false);

  const revokeExportUrls = useCallback(() => {
    if (tsvUrl) URL.revokeObjectURL(tsvUrl);
    if (takeUrls) for (const t of takeUrls) URL.revokeObjectURL(t.url);
  }, [tsvUrl, takeUrls]);

  /** Clear everything for a brand-new session */
  const resetSession = useCallback(() => {
    setPackagedCount(0);
    setInFlight(0);
    pcmChunksRef.current = [];
    sampleCountsRef.current = [];
    takesRef.current = [];
    pendingRef.current.clear();
    revokeExportUrls();
    setTsvUrl(null);
    setTsvName(null);
    setTakeUrls(null);
    setShowExport(false);
  }, [revokeExportUrls]);

  /** Called at the start of a record window: snapshot UI content and mark one in-flight take */
  const beginTake = useCallback((phrase: Phrase, words: string[]) => {
    const takeId = crypto.randomUUID();
    const snapshot = {
      phrase: JSON.parse(JSON.stringify(phrase)) as Phrase,
      words: [...words],
    };
    pendingRef.current.set(takeId, snapshot);
    setInFlight((n) => n + 1);
    return takeId;
  }, []);

  /** Called once wavBlob is available → package one take */
  const completeTakeFromBlob = useCallback(
    (
      takeId: string,
      _wavBlob: Blob | null,
      data: {
        traces: Traces;
        audio: AudioMeta;
        prompt: PromptMeta;
        timing: TimingMeta;
        controls: ControlsMeta;
        subjectId?: string;
      }
    ) => {
      const snap = pendingRef.current.get(takeId);
      if (!snap) return;

      const { phrase, words } = snap;

      const { take } = buildTakeV2({
        ids: { sessionId, takeId, subjectId: data.subjectId ?? null },
        appBuild,
        phrase,
        words,
        traces: data.traces,
        audio: data.audio,
        prompt: data.prompt,
        timing: data.timing,
        controls: data.controls,
      });

      // keep PCM for per-take WAV export
      const pcmView = data.audio.pcmView;
      if (pcmView && pcmView.length) {
        pcmChunksRef.current.push(new Float32Array(pcmView)); // copy
        sampleCountsRef.current.push(pcmView.length);
      } else {
        pcmChunksRef.current.push(new Float32Array(0));
        sampleCountsRef.current.push(0);
      }

      takesRef.current.push(take);
      pendingRef.current.delete(takeId);

      setPackagedCount((n) => n + 1);
      setInFlight((n) => Math.max(0, n - 1));
    },
    [appBuild, sessionId]
  );

  /** Build per-take WAVs + final PromptSinger TSV (NO JSON/TG needed) and surface URLs */
  const finalizeSession = useCallback((sampleRateHz: number) => {
    const N = takesRef.current.length;
    if (!N) {
      setShowExport(false);
      return { tsvUrl: null, takeUrls: null, tsvName: null };
    }

    // 1) Per-take WAVs and names
    const perTake: { name: string; url: string }[] = [];
    const itemNames: string[] = [];
    const audioPaths: string[] = [];
    for (let i = 0; i < N; i++) {
      const pcm = pcmChunksRef.current[i] ?? new Float32Array(0);
      const wavBlob = encodeWavPCM16(pcm, sampleRateHz);
      const item = `${sessionId}__take_${String(i).padStart(2, "0")}`;
      const name = `${item}.wav`;
      const url = URL.createObjectURL(wavBlob);
      perTake.push({ name, url });
      itemNames.push(item);
      audioPaths.push(name); // relative path inside the export bundle
    }
    setTakeUrls(perTake);

    // 2) Build TSV rows directly from take JSON (phones per frame + f0 fields)
    const rows = takesRef.current.map((take, i) => ({
      take,
      itemName: itemNames[i]!,
      audioPath: audioPaths[i]!,
    }));
    const tsvText = buildDatasetTsv(rows);

    // 3) Name TSV with model_id (if present) for uniqueness
    const fname = `dataset${modelId ? `.${modelId}` : ""}.tsv`;
    const tsvBlob = new Blob([tsvText], { type: "text/tab-separated-values" });
    const tsvUrlFinal = URL.createObjectURL(tsvBlob);

    setTsvName(fname);
    setTsvUrl(tsvUrlFinal);
    setShowExport(true);

    return { tsvUrl: tsvUrlFinal, takeUrls: perTake, tsvName: fname };
  }, [modelId, sessionId]);

  return {
    // counts
    packagedCount,
    inFlight,

    // pin → package
    beginTake,
    completeTakeFromBlob,

    // session lifecycle
    resetSession,
    finalizeSession,

    // export modal state
    showExport,
    setShowExport,
    tsvUrl,
    tsvName,
    takeUrls,
  };
}
