// utils/training/takePackager.ts
import { encodeWavPCM16, concatFloat32 } from "@/utils/audio/wav";
import { buildTakeV2 } from "@/utils/take/buildTakeV2";
import { buildSessionV2 } from "@/utils/take/buildSessionV2";

type Traces = { hzArr: (number | null)[]; confArr: number[]; rmsDbArr: number[]; fps: number };
type Metrics = { rmsDb: number; maxAbs: number; clippedPct: number } | null;

export function packageTake(args: {
  ids: { sessionId: string; takeId: string; subjectId?: string | null };
  appBuild: string;
  phrase: any;
  words: string[];
  traces: Traces;
  audio: {
    sampleRateOut: number;
    numSamplesOut: number | null;
    durationSec: number;
    deviceSampleRateHz: number | null;
    baseLatencySec: number | null;
    workletBufferSize: number | null;
    resampleMethod: "fir-decimate" | "linear";
    pcmView: Float32Array | null;
    metrics: Metrics;
  };
  prompt: {
    a4Hz: number; lowHz: number | null; highHz: number | null; leadInSec: number;
    bpm: number; lyricStrategy: "mixed" | "stableVowel"; lyricSeed: number; scale: string;
  };
  timing: { playStartMs: number | null; recStartMs: number | null };
  controls: { genderLabel: "male" | "female" | null };
}) {
  const { take } = buildTakeV2(args);
  const pcmCopy = args.audio.pcmView && args.audio.pcmView.length ? new Float32Array(args.audio.pcmView) : new Float32Array(0);
  return { take, pcmCopy, sampleCount: pcmCopy.length };
}

export function buildSessionArtifacts({
  pcmChunks,
  sampleRateHz,
  takes,
  takeSampleLengths,
  sessionId,
  appBuild,
}: {
  pcmChunks: Float32Array[];
  sampleRateHz: number;
  takes: any[];
  takeSampleLengths: number[];
  sessionId: string;
  appBuild: string;
}): { wavUrl: string; jsonUrl: string } {
  const merged = concatFloat32(pcmChunks);
  const wavBlob = encodeWavPCM16(merged, sampleRateHz);
  const wavUrl = URL.createObjectURL(wavBlob);

  const sessionJson = buildSessionV2({
    sessionId,
    appBuild,
    sampleRateHz,
    takes,
    takeSampleLengths,
  });
  const jsonBlob = new Blob([JSON.stringify(sessionJson, null, 2)], { type: "application/json" });
  const jsonUrl = URL.createObjectURL(jsonBlob);

  return { wavUrl, jsonUrl };
}
