// utils/midi/smf.ts
// Minimal SMF (Standard MIDI File) reader for Type 0/1.
// Extracts a monophonic "melody" line + tempo map -> Phrase in seconds.
// Also pulls karaoke lyrics from Meta(0x05) or Text(0x01).

import type { Phrase } from "@/utils/stage/scale";

type MidiTrackEvent = {
  absTicks: number;
  type: "tempo" | "noteOn" | "noteOff" | "lyric";
  channel?: number;
  pitch?: number;
  velocity?: number;
  usPerQuarter?: number;
  text?: string;
};

type ParseResult = {
  division: number; // ticks per quarter note
  tracks: MidiTrackEvent[][];
};

function readU16(b: DataView, p: number) { return b.getUint16(p, false); }
function readU32(b: DataView, p: number) { return b.getUint32(p, false); }

function readVarLen(bytes: Uint8Array, pRef: { p: number }): number {
  let v = 0, b;
  do {
    b = bytes[pRef.p++];
    v = (v << 7) | (b & 0x7f);
  } while (b & 0x80);
  return v;
}

function parseSMF(u8: Uint8Array): ParseResult {
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  let p = 0;

  const hd = String.fromCharCode(u8[p++], u8[p++], u8[p++], u8[p++]);
  if (hd !== "MThd") throw new Error("Not a MIDI file");
  const headerLen = readU32(dv, p); p += 4;
  const format = readU16(dv, p); p += 2;
  const numTracks = readU16(dv, p); p += 2;
  const division = readU16(dv, p); p += 2;
  p += (headerLen - 6);

  if ((division & 0x8000) !== 0) throw new Error("SMPTE time not supported");
  const tracks: MidiTrackEvent[][] = [];

  for (let t = 0; t < numTracks; t++) {
    const tag = String.fromCharCode(u8[p++], u8[p++], u8[p++], u8[p++]);
    if (tag !== "MTrk") throw new Error("Missing MTrk");
    const len = readU32(dv, p); p += 4;
    const end = p + len;
    p = end;
  }

  // Re-parse track body using a version of readVarLen that mutates p:
  function parseTrackBody(p0: number, end: number): { events: MidiTrackEvent[]; next: number } {
    let p = p0;
    let abs = 0;
    let runningStatus = 0;
    const evs: MidiTrackEvent[] = [];

    const readVL = () => {
      let v = 0, b;
      do {
        b = u8[p++];
        v = (v << 7) | (b & 0x7f);
      } while (b & 0x80);
      return v;
    };

    while (p < end) {
      const delta = readVL();
      abs += delta;
      let status = u8[p++];
      if (status < 0x80) {
        // Running status
        p--;
        status = runningStatus;
      } else {
        runningStatus = status;
      }

      if (status === 0xff) {
        // Meta
        const metaType = u8[p++];
        const length = readVL();
        if (metaType === 0x51 && length === 3) {
          const usPerQuarter = (u8[p] << 16) | (u8[p + 1] << 8) | u8[p + 2];
          p += 3;
          evs.push({ absTicks: abs, type: "tempo", usPerQuarter });
        } else if ((metaType === 0x05 || metaType === 0x01) && length > 0) {
          const txt = new TextDecoder("utf-8").decode(u8.slice(p, p + length)).replace(/\r?\n/g, " ").trim();
          p += length;
          if (txt) evs.push({ absTicks: abs, type: "lyric", text: txt });
        } else {
          p += length;
        }
      } else if (status === 0xf0 || status === 0xf7) {
        // SysEx
        const length = readVL();
        p += length;
      } else {
        const hi = status & 0xf0;
        const ch = status & 0x0f;
        const d1 = u8[p++];
        if (hi === 0xc0 || hi === 0xd0) {
          // Program / Channel Pressure: 1 data byte
        } else {
          const d2 = u8[p++];
          if (hi === 0x90) {
            // note on
            evs.push({ absTicks: abs, type: d2 ? "noteOn" : "noteOff", channel: ch, pitch: d1, velocity: d2 });
          } else if (hi === 0x80) {
            evs.push({ absTicks: abs, type: "noteOff", channel: ch, pitch: d1, velocity: d2 });
          }
          // ignore others
        }
      }
    }

    return { events: evs, next: end };
  }

  // Rerun properly with the helper
  {
    // rewind to after header:
    let pp = 14 + (headerLen - 6);
    for (let t = 0; t < numTracks; t++) {
      const tag = String.fromCharCode(u8[pp++], u8[pp++], u8[pp++], u8[pp++]);
      const len = readU32(dv, pp); pp += 4;
      if (tag !== "MTrk") throw new Error("Missing MTrk");
      const { events, next } = parseTrackBody(pp, pp + len);
      tracks.push(events);
      pp = next;
    }
  }

  return { division, tracks };
}

/** Choose a melody-ish track: most noteOn events. */
function pickMelodyTrack(tracks: MidiTrackEvent[][]): number {
  let best = 0, bestCount = -1;
  for (let i = 0; i < tracks.length; i++) {
    const c = tracks[i].filter(e => e.type === "noteOn").length;
    if (c > bestCount) { best = i; bestCount = c; }
  }
  return best;
}

function eventsToPhraseAndLyrics(
  division: number,
  events: MidiTrackEvent[]
): { phrase: Phrase; lyrics: string[] } {
  // Build absolute-time (seconds) as we walk by delta ticks using current tempo
  let usPerQuarter = 500000; // default 120bpm
  let lastAbsTicks = 0;
  let curSec = 0;

  // Monophonic extraction: take one voice at a time; if multiple note-ons at same tick pick highest pitch.
  let activePitch: number | null = null;
  let activeStartSec = 0;

  const notes: { midi: number; startSec: number; durSec: number }[] = [];
  const lyricTokens: { tSec: number; text: string }[] = [];

  // Group events by absTicks so we can resolve simultaneous events cleanly
  const byTick = new Map<number, MidiTrackEvent[]>();
  for (const e of events) {
    if (!byTick.has(e.absTicks)) byTick.set(e.absTicks, []);
    byTick.get(e.absTicks)!.push(e);
  }
  const ticksSorted = Array.from(byTick.keys()).sort((a, b) => a - b);

  for (const tick of ticksSorted) {
    const dt = tick - lastAbsTicks;
    if (dt > 0) {
      curSec += (dt * (usPerQuarter / 1e6)) / division;
      lastAbsTicks = tick;
    }

    // handle all events at this tick
    const batch = byTick.get(tick)!;

    // tempo changes first
    for (const e of batch) {
      if (e.type === "tempo" && e.usPerQuarter) {
        usPerQuarter = e.usPerQuarter;
      }
    }

    // lyrics
    for (const e of batch) {
      if (e.type === "lyric" && e.text) {
        lyricTokens.push({ tSec: curSec, text: e.text });
      }
    }

    // notes: if chord, keep the highest for melody start; end if matching pitch
    const ons = batch.filter(e => e.type === "noteOn" && e.pitch! >= 0) as Required<MidiTrackEvent>[];
    const offs = batch.filter(e => e.type === "noteOff" && e.pitch! >= 0) as Required<MidiTrackEvent>[];

    if (activePitch == null && ons.length) {
      const top = ons.reduce((a, b) => (a.pitch! >= b.pitch! ? a : b));
      activePitch = top.pitch!;
      activeStartSec = curSec;
    }

    if (activePitch != null) {
      const off = offs.find(e => e.pitch === activePitch);
      if (off) {
        const durSec = Math.max(0.01, curSec - activeStartSec);
        notes.push({ midi: activePitch, startSec: activeStartSec, durSec });
        activePitch = null;
      }
    }
  }

  // close dangling
  if (activePitch != null) {
    const durSec = Math.max(0.01, ((lastAbsTicks * (usPerQuarter / 1e6)) / division) - activeStartSec);
    notes.push({ midi: activePitch, startSec: activeStartSec, durSec });
  }

  // normalize to start at 0
  const t0 = notes.length ? notes[0].startSec : 0;
  for (const n of notes) n.startSec -= t0;
  for (const l of lyricTokens) l.tSec -= t0;

  // duration = last note end
  const durationSec = notes.length
    ? Math.max(...notes.map(n => n.startSec + n.durSec))
    : 0;

  const words = alignLyricsToNotes(lyricTokens.map(x => x.text), notes.length);

  return {
    phrase: { durationSec, notes },
    lyrics: words,
  };
}

/** Simple 1:1 alignment: trim/pad to N notes, ignore timing. */
function alignLyricsToNotes(tokens: string[], n: number): string[] {
  const words = tokens.map(t => t.trim()).filter(Boolean);
  const out = words.slice(0, n);
  while (out.length < n) out.push("la");
  return out;
}

/** Public API */
export function parseMidiToPhraseAndLyrics(
  bytes: ArrayBuffer | Uint8Array,
  trackIndex?: number
): { phrase: Phrase; lyrics: string[] } {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const { division, tracks } = parseSMF(u8);
  const idx = typeof trackIndex === "number" ? Math.max(0, Math.min(trackIndex, tracks.length - 1)) : pickMelodyTrack(tracks);
  return eventsToPhraseAndLyrics(division, tracks[idx]);
}
