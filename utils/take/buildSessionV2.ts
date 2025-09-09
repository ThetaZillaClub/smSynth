// utils/take/buildSessionV2.ts
export function buildSessionV2({
  sessionId,
  appBuild,
  sampleRateHz,
  takes,
  takeSampleLengths,
  createdAt = new Date().toISOString(),
}: {
  sessionId: string;
  appBuild: string;
  sampleRateHz: number;
  takes: any[];
  takeSampleLengths: number[];
  createdAt?: string;
}) {
  const nTakes = Array.isArray(takes) ? takes.length : 0;
  const nLens = Array.isArray(takeSampleLengths) ? takeSampleLengths.length : 0;
  const N = Math.min(nTakes, nLens);

  if (nTakes !== nLens) {
    // Don’t throw in production; truncate safely and log a clear warning.
    console.warn(
      `[buildSessionV2] length mismatch: takes=${nTakes} sampleLengths=${nLens}; truncating to N=${N}`
    );
  }

  const safeTakes = takes.slice(0, N);
  const safeLens = takeSampleLengths.slice(0, N);

  // offsets[i] = sum_{k < i} safeLens[k]
  const offsets: number[] = new Array(N);
  let acc = 0;
  for (let i = 0; i < N; i++) {
    offsets[i] = acc;
    acc += safeLens[i] ?? 0;
  }

  const takesWithOffsets = safeTakes.map((t, i) => ({
    ...t,
    session_offset_samples: offsets[i],
    take_index: i,
  }));

  return {
    version: 1,
    created_at: createdAt,
    ids: { session_id: sessionId },
    app: { build: appBuild },
    audio: {
      wav: {
        sample_rate_hz: sampleRateHz,
        num_channels: 1,
        total_samples: acc,
      },
    },
    files: { wav: "session.wav", json: "session.json" },
    counts: { takes: N },
    takes: takesWithOffsets,
    debug: nTakes === nLens ? undefined : { n_takes_input: nTakes, n_lengths_input: nLens, used: N },
  };
}
