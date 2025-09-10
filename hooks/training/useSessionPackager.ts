// hooks/training/useSessionPackager.ts
"use client";

import { useCallback, useRef, useState } from "react";
import type { Phrase } from "@/components/piano-roll/types";
import { buildTakeV2 } from "@/utils/take/buildTakeV2";
import { buildSessionV2 } from "@/utils/take/buildSessionV2";
import { concatFloat32, encodeWavPCM16 } from "@/utils/audio/wav";

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

export default function useSessionPackager(opts: { appBuild: string; sessionId: string }) {
  const { appBuild, sessionId } = opts;

  // counts for guard/UI
  const [packagedCount, setPackagedCount] = useState(0);
  const [inFlight, setInFlight] = useState(0);

  // aggregate data
  const pcmChunksRef = useRef<Float32Array[]>([]);
  const sampleCountsRef = useRef<number[]>([]);
  const takesRef = useRef<any[]>([]);

  // pinned for current recording window
  const pinnedPhraseRef = useRef<Phrase | null>(null);
  const pinnedWordsRef = useRef<string[] | null>(null);
  const takeIdRef = useRef<string>("");

  const lastPackagedBlobRef = useRef<Blob | null>(null);

  // export urls
  const [sessionWavUrl, setSessionWavUrl] = useState<string | null>(null);
  const [sessionJsonUrl, setSessionJsonUrl] = useState<string | null>(null);
  const [showExport, setShowExport] = useState(false);

  /** Clear everything for a brand-new session */
  const resetSession = useCallback(() => {
    setPackagedCount(0);
    setInFlight(0);
    pcmChunksRef.current = [];
    sampleCountsRef.current = [];
    takesRef.current = [];
    pinnedPhraseRef.current = null;
    pinnedWordsRef.current = null;
    takeIdRef.current = "";
    lastPackagedBlobRef.current = null;
    if (sessionWavUrl) URL.revokeObjectURL(sessionWavUrl);
    if (sessionJsonUrl) URL.revokeObjectURL(sessionJsonUrl);
    setSessionWavUrl(null);
    setSessionJsonUrl(null);
    setShowExport(false);
  }, [sessionWavUrl, sessionJsonUrl]);

  /** Called at the start of a record window to pin UI content and mark one in-flight take */
  const beginTake = useCallback((phrase: Phrase, words: string[]) => {
    const takeId = crypto.randomUUID();
    pinnedPhraseRef.current = phrase;
    pinnedWordsRef.current = words;
    takeIdRef.current = takeId;
    setInFlight((n) => n + 1);
    return takeId;
  }, []);

  /** Called once wavBlob is available → package one take (de-duped) */
  const completeTakeFromBlob = useCallback(
    (
      wavBlob: Blob | null,
      data: {
        traces: Traces;
        audio: AudioMeta;
        prompt: PromptMeta;
        timing: TimingMeta;
        controls: ControlsMeta;
        /** NEW: put your subject label (creator_display_name) here */
        subjectId?: string;
      }
    ) => {
      if (!wavBlob || !pinnedPhraseRef.current || !pinnedWordsRef.current || !takeIdRef.current) return;
      if (lastPackagedBlobRef.current === wavBlob) return; // de-dupe
      lastPackagedBlobRef.current = wavBlob;

      const { take } = buildTakeV2({
        ids: { sessionId, takeId: takeIdRef.current, subjectId: data.subjectId ?? null },
        appBuild,
        phrase: pinnedPhraseRef.current,
        words: pinnedWordsRef.current,
        traces: data.traces,
        audio: data.audio,
        prompt: data.prompt,
        timing: data.timing,
        controls: data.controls,
      });

      // aggregate PCM + take
      const pcmView = data.audio.pcmView;
      if (pcmView && pcmView.length) {
        pcmChunksRef.current.push(new Float32Array(pcmView)); // copy
        sampleCountsRef.current.push(pcmView.length);
      } else {
        pcmChunksRef.current.push(new Float32Array(0));
        sampleCountsRef.current.push(0);
      }
      takesRef.current.push(take);

      setPackagedCount((n) => n + 1);
      setInFlight((n) => Math.max(0, n - 1));
    },
    [appBuild, sessionId]
  );

  /** Build combined WAV + JSON and surface URLs */
  const finalizeSession = useCallback((sampleRateHz: number) => {
    if (!takesRef.current.length) {
      setShowExport(false);
      return { wavUrl: null, jsonUrl: null };
    }
    const merged = concatFloat32(pcmChunksRef.current);
    const wavBlobFinal = encodeWavPCM16(merged, sampleRateHz);
    const wavUrlFinal = URL.createObjectURL(wavBlobFinal);
    setSessionWavUrl(wavUrlFinal);

    const sessionJson = buildSessionV2({
      sessionId,
      appBuild,
      sampleRateHz,
      takes: takesRef.current,
      takeSampleLengths: sampleCountsRef.current,
    });
    const jsonBlob = new Blob([JSON.stringify(sessionJson, null, 2)], { type: "application/json" });
    const jsonUrlFinal = URL.createObjectURL(jsonBlob);
    setSessionJsonUrl(jsonUrlFinal);

    setShowExport(true);
    return { wavUrl: wavUrlFinal, jsonUrl: jsonUrlFinal };
  }, [appBuild, sessionId]);

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
    sessionWavUrl,
    sessionJsonUrl,
  };
}
