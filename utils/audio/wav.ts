// utils/audio/wav.ts

/** Concatenate an array of Float32Array (mono) into one buffer. */
export function concatFloat32(chunks: Float32Array[]): Float32Array {
  const total = chunks.reduce((a, c) => a + (c?.length ?? 0), 0);
  const out = new Float32Array(total);
  let o = 0;
  for (const c of chunks) {
    if (!c || !c.length) continue;
    out.set(c, o);
    o += c.length;
  }
  return out;
}

/** Encode mono Float32 PCM in [-1,1] to 16-bit PCM WAV. */
export function encodeWavPCM16(mono: Float32Array, sampleRate: number): Blob {
  // clamp & convert
  const N = mono.length;
  const pcm16 = new Int16Array(N);
  for (let i = 0; i < N; i++) {
    let s = mono[i];
    if (s > 1) s = 1;
    else if (s < -1) s = -1;
    pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }

  // RIFF/WAVE header
  const blockAlign = 2; // 16-bit mono
  const byteRate = sampleRate * blockAlign;
  const dataSize = pcm16.byteLength;

  const buf = new ArrayBuffer(44 + dataSize);
  const dv = new DataView(buf);
  let p = 0;
  const wstr = (s: string) => { for (let i = 0; i < s.length; i++) dv.setUint8(p++, s.charCodeAt(i)); };
  const w16  = (v: number) => { dv.setUint16(p, v, true); p += 2; };
  const w32  = (v: number) => { dv.setUint32(p, v, true); p += 4; };

  wstr("RIFF"); w32(36 + dataSize);
  wstr("WAVE");
  wstr("fmt "); w32(16); w16(1); w16(1); w32(sampleRate); w32(byteRate); w16(blockAlign); w16(16);
  wstr("data"); w32(dataSize);

  new Uint8Array(buf, 44).set(new Uint8Array(pcm16.buffer));
  return new Blob([buf], { type: "audio/wav" });
}
