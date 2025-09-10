// utils/tsv/buildDatasetTsv.ts
import { CONF_THRESHOLD } from "@/utils/training/constants";

type TakeV2 = {
  ids: { take_id: string; session_id: string; subject_id: string | null };
  audio: { wav: { sample_rate_hz: number; num_samples: number } };
  lyric: { words: string[]; phones: string[]; align: "one_word_per_note" };
  timing: {
    first_note_at_sec: number;
    note_onsets_sec: number[]; // relative to phrase (starts at 0)
    note_offsets_sec: number[]; // relative to phrase
  };
  pitch: {
    trace: {
      fps: number; // should be 50
      start_at_sec: number; // 0
      hz: (number | null)[];
      conf: number[];
    };
  };
  controls: { gender_label: "male" | "female" | null; pitch_label?: "low" | "high" | null };
};

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

function medianNonzero(arr: number[]): number | null {
  const nz = arr.filter((x) => x > 0).sort((a, b) => a - b);
  if (!nz.length) return null;
  const m = (nz.length - 1) / 2;
  return nz.length % 2 ? nz[m | 0]! : 0.5 * (nz[m | 0 - 0]! + nz[m | 0 + 1]!);
}

/** Expand phones to 50fps frames using note on/offsets and first-note offset. */
export function expandPhonesPerFrame(take: TakeV2, nFrames: number, fps = 50): string[] {
  const out = new Array<string>(nFrames).fill("SP");

  const first = take.timing.first_note_at_sec ?? 0;
  const onsets = take.timing.note_onsets_sec || [];
  const offsets = take.timing.note_offsets_sec || [];
  const phones = take.lyric.phones || [];

  const N = Math.min(phones.length, onsets.length, offsets.length);
  if (!N) return out;

  const toF = (t: number) => clamp(Math.round(t * fps), 0, nFrames);

  for (let k = 0; k < N; k++) {
    const f0 = toF(first + onsets[k]!);
    const f1 = toF(first + offsets[k]!);
    if (f1 <= f0) continue;
    const ph = phones[k] || "SP";
    for (let f = f0; f < f1; f++) out[f] = ph;
  }
  return out;
}

/** Build f0_avg (int) and f0_rescale (space-separated ints) like Repo scripts. */
export function buildF0Fields(
  take: TakeV2,
  nFrames: number,
  fps = 50,
  confThresh = CONF_THRESHOLD
): { f0_avg_int: number; f0_rescale_ints: number[] } {
  // Align hz/conf traces to nFrames (pad with 0/0; truncate if longer)
  const hz = new Array<number>(nFrames);
  const conf = new Array<number>(nFrames);
  for (let i = 0; i < nFrames; i++) {
    const h = take.pitch.trace.hz[i] ?? 0;
    const c = take.pitch.trace.conf[i] ?? 0;
    hz[i] = (h && isFinite(h) && h > 0 && c >= confThresh) ? h : 0;
    conf[i] = c;
  }

  // Round → clip to [45..850] (nonzero), leave zeros as 0 (voiceless)
  const pitch_round = hz.map((x) => Math.round(x));
  const pitch_clip = pitch_round.map((x) => (x === 0 ? 0 : clamp(x, 45, 850)));

  // Average of non-zeros, rounded to int
  const nonzero = pitch_clip.filter((x) => x > 0);
  const f0_avg_int = nonzero.length
    ? Math.round(nonzero.reduce((a, c) => a + c, 0) / nonzero.length)
    : 0;

  // Rescale (repo uses 222 / avg) — zeros stay zero
  const denom = f0_avg_int || 1; // avoid div-by-zero
  const f0_rescale_ints = pitch_clip.map((x) => (x === 0 ? 0 : Math.round((x * 222) / denom)));

  return { f0_avg_int, f0_rescale_ints };
}

function computeNFrames(numSamples: number, sr: number) {
  return Math.max(0, Math.round((numSamples / sr) * 50));
}

function sanitizeText(s: string) {
  return (s || "").replace(/\t/g, " ").replace(/\r?\n/g, " ").trim();
}

export type BuildDatasetRowInput = {
  take: TakeV2;
  itemName: string;
  audioPath: string; // the filename you export for this take, e.g., "<item>.wav"
};

export function buildDatasetRow({ take, itemName, audioPath }: BuildDatasetRowInput): string {
  const sr = take.audio.wav.sample_rate_hz || 16000;
  const numSamples = take.audio.wav.num_samples || 0;
  const nFrames = computeNFrames(numSamples, sr);
  const fps = take.pitch?.trace?.fps || 50;

  const phonesPerFrame = expandPhonesPerFrame(take, nFrames, fps);
  const phone = phonesPerFrame.join(" ");

  const { f0_avg_int, f0_rescale_ints } = buildF0Fields(take, nFrames, fps, CONF_THRESHOLD);
  const txt = sanitizeText((take.lyric.words || []).join(" "));

  // pitch label: prefer what you already computed in buildTakeV2; else infer from median
  let pitchLabel = take.controls?.pitch_label ?? null;
  if (!pitchLabel) {
    const med = medianNonzero(
      (take.pitch?.trace?.hz || []).map((x) => (x && isFinite(x) ? x : 0))
    );
    pitchLabel = med != null && med >= 180 ? "high" : "low";
  }

  const gender = take.controls?.gender_label ?? "";

  // Columns must match PromptSinger examples:
  // item_name | task | audio_path | gender | phone | txt | f0_rescale | f0_avg | n_frames | pitch
  const task = "text_to_acoustic_sing";
  const cols = [
    itemName,
    task,
    audioPath,
    gender,
    phone,
    txt,
    f0_rescale_ints.join(" "),
    String(f0_avg_int),
    String(nFrames),
    pitchLabel || "",
  ];
  return cols.join("\t");
}

/** Build the whole TSV text (header + rows). */
export function buildDatasetTsv(
  inputs: BuildDatasetRowInput[]
): string {
  const header =
    "item_name\ttask\taudio_path\tgender\tphone\ttxt\tf0_rescale\tf0_avg\tn_frames\tpitch";
  const rows = inputs.map(buildDatasetRow);
  return [header, ...rows].join("\n") + "\n";
}
