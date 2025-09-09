// utils/take/buildTakeV2.ts
import type { Phrase } from "@/components/piano-roll/types";
import { midiToHz } from "@/utils/pitch/pitchMath";
import { getPhonemeForWord } from "@/utils/lyrics/wordBank";
import { mean, median, dbfs, clamp } from "@/utils/math/stats";
import { CONF_THRESHOLD, MIN_NOISE_FRAMES } from "@/utils/training/constants";

export function buildTakeV2({
  ids, appBuild, phrase, words, traces, audio, prompt, timing, controls
}: {
  ids: { sessionId: string; takeId: string; subjectId?: string | null };
  appBuild: string;
  phrase: Phrase;
  words: string[];
  traces: { hzArr: (number | null)[]; confArr: number[]; rmsDbArr: number[]; fps: number };
  audio: {
    sampleRateOut: number; numSamplesOut: number | null; durationSec: number;
    deviceSampleRateHz: number | null; baseLatencySec: number | null; workletBufferSize: number | null;
    resampleMethod: "fir-decimate" | "linear"; pcmView: Float32Array | null;
    metrics: { rmsDb: number; maxAbs: number; clippedPct: number } | null;
  };
  prompt: {
    a4Hz: number; lowHz: number | null; highHz: number | null; leadInSec: number;
    bpm: number; lyricStrategy: "mixed" | "stableVowel"; lyricSeed: number; scale: string;
  };
  timing: { playStartMs: number | null; recStartMs: number | null };
  controls: { genderLabel: "male" | "female" | null };
}) {
  const { hzArr, confArr, rmsDbArr, fps } = traces;

  const phones = words.map((w) => getPhonemeForWord(w));
  const note_onsets_sec = phrase.notes.map((n) => n.startSec);
  const note_offsets_sec = phrase.notes.map((n) => n.startSec + n.durSec);

  const driftSec =
    timing.playStartMs != null && timing.recStartMs != null
      ? (timing.playStartMs - timing.recStartMs) / 1000
      : 0;

  const first_note_at_rec_sec = prompt.leadInSec + driftSec;
  const first_note_at_sample = Math.max(0, Math.round(first_note_at_rec_sec * audio.sampleRateOut));
  const note_onsets_samples = note_onsets_sec.map((t) => first_note_at_sample + Math.round(t * audio.sampleRateOut));
  const note_offsets_samples = note_offsets_sec.map((t) => first_note_at_sample + Math.round(t * audio.sampleRateOut));

  const frameTimesSec = Array.from({ length: rmsDbArr.length }, (_, i) => i / fps);
  const noiseFrameIdx = frameTimesSec.map((t, i) => (t < first_note_at_rec_sec ? i : -1)).filter((i) => i >= 0);
  const voicedIdx = hzArr
    .map((hz, i) => (hz != null && (confArr[i] ?? 0) >= CONF_THRESHOLD ? i : -1))
    .filter((i) => i >= 0);

  const noiseDbFrames = noiseFrameIdx.length >= MIN_NOISE_FRAMES ? noiseFrameIdx.map((i) => rmsDbArr[i]) : [];
  let noiseDb = -120;
  if (noiseDbFrames.length) {
    noiseDb = mean(noiseDbFrames);
  } else if (rmsDbArr.length) {
    const sorted = [...rmsDbArr].sort((a, b) => a - b);
    const p10 = sorted[Math.max(0, Math.floor(sorted.length * 0.1) - 1)] ?? sorted[0];
    noiseDb = p10;
  }

  const voicedRmsDb = voicedIdx.map((i) => rmsDbArr[i]).filter((x) => isFinite(x));
  const rms_dbfs_voiced = voicedRmsDb.length ? mean(voicedRmsDb) : -120;
  const snr_db_voiced = rms_dbfs_voiced - noiseDb;

  const f0_voiced = voicedIdx.map((i) => hzArr[i] as number).filter((x) => isFinite(x) && x > 0);
  const f0_avg = f0_voiced.length ? mean(f0_voiced) : null;
  const f0_med = f0_voiced.length ? median(f0_voiced) : null;

  const note_rms_dbfs: number[] = [];
  if (audio.pcmView && note_onsets_samples.length === note_offsets_samples.length) {
    for (let k = 0; k < note_onsets_samples.length; k++) {
      const s0 = clamp(note_onsets_samples[k], 0, audio.pcmView.length);
      const s1 = clamp(note_offsets_samples[k], 0, audio.pcmView.length);
      const L = Math.max(0, s1 - s0);
      if (L < 8) { note_rms_dbfs.push(-120); continue; }
      let sumSq = 0;
      for (let i = s0; i < s1; i++) sumSq += audio.pcmView[i]! * audio.pcmView[i]!;
      note_rms_dbfs.push(dbfs(Math.sqrt(sumSq / L)));
    }
  }

  const clippedPct = audio.metrics?.clippedPct ?? 0;
  const classifyVolume = (r: number, s: number, c: number) => {
    if (c >= 0.5) return "loud";
    if (s >= 18 && r >= -22) return "loud";
    if (s >= 12 && r >= -28) return "normal";
    return "soft";
  };
  const volume_label = classifyVolume(rms_dbfs_voiced, snr_db_voiced, clippedPct);
  const pitch_label = f0_med == null ? null : (f0_med < 180 ? "low" : "high");

  const peaks = audio.metrics?.maxAbs ?? 0;
  const recRmsDb = audio.metrics?.rmsDb ?? -120;
  const reasons: string[] = [];
  if (voicedIdx.length === 0) reasons.push("no_voiced_frames");
  if (snr_db_voiced < 6) reasons.push("low_snr");
  if (clippedPct >= 0.5) reasons.push("heavy_clipping");
  const passed =
    clippedPct < 0.1 &&
    recRmsDb > -35 &&
    snr_db_voiced >= 6 &&
    (voicedIdx.length / Math.max(1, rmsDbArr.length)) >= 0.4 &&
    reasons.length === 0;

  const targets_hz = phrase.notes.map((n) => midiToHz(n.midi, prompt.a4Hz));

  const take = {
    version: 2,
    ids: {
      take_id: ids.takeId,
      session_id: ids.sessionId,
      subject_id: ids.subjectId ?? null,
    },
    created_at: new Date().toISOString(),
    app: {
      build: appBuild,
      platform: { user_agent: (typeof navigator !== "undefined" ? navigator.userAgent : "") },
    },
    audio: {
      wav: {
        sample_rate_hz: audio.sampleRateOut,
        num_channels: 1,
        num_samples: audio.numSamplesOut ?? Math.round(audio.durationSec * audio.sampleRateOut),
      },
      device: {
        input_sample_rate_hz: audio.deviceSampleRateHz ?? 48000,
        base_latency_sec: audio.baseLatencySec ?? null,
        worklet_buffer: audio.workletBufferSize ?? null,
      },
      processing: { downmix: "avg", resample: audio.resampleMethod },
    },
    prompt: {
      scale: prompt.scale,
      a4_hz: prompt.a4Hz,
      low_hz: prompt.lowHz ?? null,
      high_hz: prompt.highHz ?? null,
      bpm: prompt.bpm,
      lead_in_sec: prompt.leadInSec,
      lyric_strategy: prompt.lyricStrategy,
      lyric_seed: prompt.lyricSeed,
    },
    controls: {
      volume_label,
      pitch_label,
      gender_label: controls.genderLabel,
    },
    features: {
      volume: {
        rms_dbfs_voiced,
        snr_db_voiced,
        note_rms_dbfs,
        method: "50fps_rms_trace voiced-only; pre-first-note RMS as noise reference",
        conf_threshold: CONF_THRESHOLD,
      },
      f0: {
        avg_hz_voiced: f0_avg,
        median_hz_voiced: f0_med,
        conf_threshold: CONF_THRESHOLD,
      },
    },
    phrase,
    targets_hz,
    lyric: {
      words,
      phones,
      align: "one_word_per_note" as const,
    },
    timing: {
      first_note_at_sec: first_note_at_sample / audio.sampleRateOut,
      first_note_at_sample,
      note_onsets_sec,
      note_offsets_sec,
      note_onsets_samples,
      note_offsets_samples,
    },
    pitch: {
      algorithm: "SwiftF0",
      model: "model.onnx",
      trace: { fps, start_at_sec: 0, hz: hzArr, conf: confArr },
      rms_db_trace: rmsDbArr,
    },
    qc: {
      peak_abs: peaks,
      rms_dbfs: recRmsDb,
      noise_floor_dbfs: noiseDb,
      snr_db: recRmsDb - noiseDb,
      snr_db_voiced,
      clipped_pct: clippedPct,
      voiced_ratio: voicedIdx.length / Math.max(1, rmsDbArr.length),
      passed,
      reasons,
    },
    files: { wav: "take.wav", json: "take.json" },
    sanity: {
      notes_count: phrase.notes.length,
      words_count: words.length,
      phones_count: phones.length,
      words_match_notes: words.length === phrase.notes.length,
      phones_match_notes: phones.length === phrase.notes.length,
      first_note_at_sample_gte0: first_note_at_sample >= 0,
      pitch_trace_lengths_match: hzArr.length === confArr.length,
      rms_trace_aligned: hzArr.length === rmsDbArr.length,
      voiced_frames_count: voicedIdx.length,
    },
  };

  return { take };
}
