// components/training/TrainingCurriculum.tsx
// ---------------------------------------------------
"use client";

import React, { useCallback, useMemo, useState } from "react";
import TransportPanelControlled from "./layout/transport/TransportPanelControlled";
import {
  DEFAULT_SESSION_CONFIG,
  type SessionConfig,
} from "./layout/session/types";
import type { Phrase } from "@/utils/piano-roll/scale";
import { parseMidiToPhraseAndLyrics } from "@/utils/midi/smf";
import type { NoteValue } from "@/utils/time/tempo";
import type { ScaleName } from "@/utils/phrase/scales";

function safeParsePhrase(s: string): Phrase | null {
  try {
    const v = JSON.parse(s);
    if (v && Array.isArray(v.notes) && typeof v.durationSec === "number") return v as Phrase;
  } catch {}
  return null;
}

const NOTE_VALUE_OPTIONS: { label: string; value: NoteValue }[] = [
  { label: "Whole", value: "whole" },
  { label: "Dotted Half", value: "dotted-half" },
  { label: "Half", value: "half" },
  { label: "Dotted Quarter", value: "dotted-quarter" },
  { label: "Triplet Quarter", value: "triplet-quarter" },
  { label: "Quarter", value: "quarter" },
  { label: "Dotted Eighth", value: "dotted-eighth" },
  { label: "Triplet Eighth", value: "triplet-eighth" },
  { label: "Eighth", value: "eighth" },
  { label: "Dotted Sixteenth", value: "dotted-sixteenth" },
  { label: "Triplet Sixteenth", value: "triplet-sixteenth" },
  { label: "Sixteenth", value: "sixteenth" },
  { label: "Thirty-second", value: "thirtysecond" },
];

const TONIC_OPTIONS = [
  { label: "C", value: 0 }, { label: "C#", value: 1 }, { label: "D", value: 2 }, { label: "D#", value: 3 },
  { label: "E", value: 4 }, { label: "F", value: 5 }, { label: "F#", value: 6 }, { label: "G", value: 7 },
  { label: "G#", value: 8 }, { label: "A", value: 9 }, { label: "A#", value: 10 }, { label: "B", value: 11 },
];

const SCALE_OPTIONS: { label: string; value: ScaleName }[] = [
  { label: "Major", value: "major" },
  { label: "Natural Minor", value: "natural_minor" },
  { label: "Harmonic Minor", value: "harmonic_minor" },
  { label: "Melodic Minor", value: "melodic_minor" },
  { label: "Dorian", value: "dorian" },
  { label: "Phrygian", value: "phrygian" },
  { label: "Lydian", value: "lydian" },
  { label: "Mixolydian", value: "mixolydian" },
  { label: "Locrian", value: "locrian" },
  { label: "Major Pentatonic", value: "major_pentatonic" },
  { label: "Minor Pentatonic", value: "minor_pentatonic" },
  { label: "Chromatic", value: "chromatic" },
];

export default function TrainingCurriculum({
  onStart,
  defaultConfig,
}: {
  onStart: (cfg: SessionConfig) => void;
  defaultConfig?: Partial<SessionConfig>;
}) {
  const init = useMemo<SessionConfig>(
    () => ({ ...DEFAULT_SESSION_CONFIG, ...(defaultConfig || {}) }),
    [defaultConfig]
  );
  const [cfg, setCfg] = useState<SessionConfig>(init);

  const [phraseJson, setPhraseJson] = useState(
    cfg.customPhrase ? JSON.stringify(cfg.customPhrase, null, 2) : ""
  );
  const [customLyrics, setCustomLyrics] = useState(
    Array.isArray(cfg.customWords) ? cfg.customWords.join(", ") : ""
  );

  // Merge helper (typed) to avoid TS widening on nested objects
  const pushChange = useCallback((patch: Partial<SessionConfig>) => {
    setCfg((c: SessionConfig): SessionConfig => ({ ...c, ...patch } as SessionConfig));
  }, []);

  const launch = useCallback(() => {
    const p = phraseJson.trim() ? safeParsePhrase(phraseJson.trim()) : cfg.customPhrase ?? null;
    const w =
      customLyrics.trim()
        ? customLyrics
            .split(",")
            .map((s: string) => s.trim())
            .filter(Boolean)
        : cfg.customWords ?? null;

    onStart({
      ...cfg,
      customPhrase: p,
      customWords: w,
    });
  }, [cfg, onStart, phraseJson, customLyrics]);

  const onMidiFile = useCallback(async (file: File) => {
    const buf = await file.arrayBuffer();
    try {
      const { phrase, lyrics } = parseMidiToPhraseAndLyrics(buf);
      setCfg((c: SessionConfig): SessionConfig => ({ ...c, customPhrase: phrase, customWords: lyrics }));
      setPhraseJson(JSON.stringify(phrase, null, 2));
      setCustomLyrics(lyrics.join(", "));
    } catch (e) {
      // eslint-disable-next-line no-alert
      alert("Failed to parse MIDI: " + (e as Error)?.message);
    }
  }, []);

  // Shortcuts for nested cfg (with defaults)
  const scaleCfg = cfg.scale ?? { tonicPc: 0, name: "major" as ScaleName, maxPerDegree: 2, seed: 0xC0FFEE };
  const rhythmCfg = cfg.rhythm ?? { preset: "equal" as const, noteValue: (cfg.noteValue ?? "eighth"), length: 8, allowRests: false, seed: 0xA5F3D7 };

  return (
    <div className="min-h-dvh h-dvh flex flex-col bg-gradient-to-b from-[#f0f0f0] to-[#d2d2d2] text-[#0f0f0f]">
      {/* Header */}
      <div className="w-full flex justify-center pt-4 px-6 pb-2">
        <div className="w-full max-w-7xl">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Training — Curriculum</h1>
          <p className="text-sm text-[#2d2d2d] mt-1">
            Configure this session. These settings apply only to the game you launch now.
          </p>
        </div>
      </div>

      {/* Body */}
      <div className="w-full flex-1 flex flex-col gap-4 min-h-0 px-6 pb-6">
        {/* Transport */}
        <div className="w-full max-w-7xl mx-auto mt-2">
          <TransportPanelControlled
            bpm={cfg.bpm}
            ts={cfg.ts}
            leadBars={cfg.leadBars}
            restBars={cfg.restBars}
            onChange={(patch) => pushChange(patch)}
          />
        </div>

        {/* Content: Scale & Rhythm + Lyrics */}
        <div className="w-full max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-3">
          <div className="rounded-lg border border-[#d2d2d2] bg-[#ebebeb] p-3">
            <div className="text-[11px] uppercase tracking-wide text-[#6b6b6b] mb-2">Scale & Rhythm</div>

            {/* Scale & Rhythm */}
            <div className="rounded-lg border border-[#d2d2d2] bg-[#ebebeb] p-3">
              <div className="text-[11px] uppercase tracking-wide text-[#6b6b6b] mb-2">Scale & Rhythm</div>

              {/* Scale */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <Field label="Tonic">
                  <select
                    className="w-full rounded-md border border-[#d2d2d2] bg-white px-2 py-1 text-sm"
                    value={scaleCfg.tonicPc}
                    onChange={(e) =>
                      pushChange({ scale: { ...scaleCfg, tonicPc: Math.max(0, Math.min(11, Number(e.target.value) || 0)) } })
                    }
                  >
                    {TONIC_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Scale">
                  <select
                    className="w-full rounded-md border border-[#d2d2d2] bg-white px-2 py-1 text-sm"
                    value={scaleCfg.name}
                    onChange={(e) => pushChange({ scale: { ...scaleCfg, name: e.target.value as ScaleName } })}
                  >
                    {SCALE_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Max per degree (random only)">
                  <input
                    type="number"
                    inputMode="numeric"
                    className="w-full rounded-md border border-[#d2d2d2] bg-white px-2 py-1 text-sm"
                    value={scaleCfg.maxPerDegree ?? 2}
                    min={1}
                    max={8}
                    onChange={(e) =>
                      pushChange({ scale: { ...scaleCfg, maxPerDegree: Math.max(1, Math.floor(Number(e.target.value) || 1)) } })
                    }
                  />
                </Field>
              </div>

              {/* Rhythm */}
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 mt-3">
                <Field label="Mode">
                  <select
                    className="w-full rounded-md border border-[#d2d2d2] bg-white px-2 py-1 text-sm"
                    value={(rhythmCfg as any).mode ?? "random"}
                    onChange={(e) => {
                      const mode = e.target.value as "sequence" | "random";
                      pushChange({
                        rhythm:
                          mode === "sequence"
                            ? { mode: "sequence", pattern: "asc", available: ["quarter"], restProb: 0.3, seed: 0xD1A1 }
                            : { mode: "random", available: ["quarter"], restProb: 0.3, seed: 0xA5F3D7 },
                      });
                    }}
                  >
                    <option value="sequence">Sequence</option>
                    <option value="random">Random</option>
                  </select>
                </Field>

                {"mode" in rhythmCfg && rhythmCfg.mode === "sequence" ? (
                  <>
                    <Field label="Pattern">
                      <select
                        className="w-full rounded-md border border-[#d2d2d2] bg-white px-2 py-1 text-sm"
                        value={rhythmCfg.pattern}
                        onChange={(e) => pushChange({ rhythm: { ...rhythmCfg, pattern: e.target.value as any } })}
                      >
                        <option value="asc">Ascending</option>
                        <option value="desc">Descending</option>
                        <option value="asc-desc">Asc → Desc</option>
                        <option value="desc-asc">Desc → Asc</option>
                      </select>
                    </Field>
                    <Field label="Available note lengths">
                      <div className="flex flex-wrap gap-2">
                        {NOTE_VALUE_OPTIONS
                          .filter((o) => ["whole","half","quarter","eighth","sixteenth","triplet-eighth","dotted-eighth"].includes(o.value))
                          .map((o) => {
                            const arr = new Set(rhythmCfg.available ?? ["quarter"]);
                            const checked = arr.has(o.value);
                            return (
                              <label key={o.value} className="inline-flex items-center gap-1 text-sm">
                                <input
                                  type="checkbox"
                                  className="accent-black"
                                  checked={checked}
                                  onChange={(e) => {
                                    if (e.target.checked) arr.add(o.value); else arr.delete(o.value);
                                    pushChange({ rhythm: { ...rhythmCfg, available: Array.from(arr) as NoteValue[] } });
                                  }}
                                />
                                <span>{o.label}</span>
                              </label>
                            );
                          })}
                      </div>
                    </Field>
                    <Field label="Rest probability">
                      <input
                        type="number"
                        step="0.05"
                        min={0}
                        max={0.95}
                        className="w-full rounded-md border border-[#d2d2d2] bg-white px-2 py-1 text-sm"
                        value={rhythmCfg.restProb ?? 0.3}
                        onChange={(e) => pushChange({ rhythm: { ...rhythmCfg, restProb: Math.max(0, Math.min(0.95, Number(e.target.value) || 0.3)) } })}
                      />
                    </Field>
                  </>
                ) : (
                  <>
                    <Field label="Available note lengths">
                      <div className="flex flex-wrap gap-2">
                        {NOTE_VALUE_OPTIONS
                          .filter((o) => ["whole","half","quarter","eighth","sixteenth","triplet-eighth","dotted-eighth"].includes(o.value))
                          .map((o) => {
                            const arr = new Set((rhythmCfg as any).available ?? ["quarter"]);
                            const checked = arr.has(o.value);
                            return (
                              <label key={o.value} className="inline-flex items-center gap-1 text-sm">
                                <input
                                  type="checkbox"
                                  className="accent-black"
                                  checked={checked}
                                  onChange={(e) => {
                                    if (e.target.checked) arr.add(o.value); else arr.delete(o.value);
                                    pushChange({ rhythm: { ...(rhythmCfg as any), available: Array.from(arr) as NoteValue[] } });
                                  }}
                                />
                                <span>{o.label}</span>
                              </label>
                            );
                          })}
                      </div>
                    </Field>
                    <Field label="Rest probability">
                      <input
                        type="number"
                        step="0.05"
                        min={0}
                        max={0.95}
                        className="w-full rounded-md border border-[#d2d2d2] bg-white px-2 py-1 text-sm"
                        value={(rhythmCfg as any).restProb ?? 0.3}
                        onChange={(e) =>
                          pushChange({ rhythm: { ...(rhythmCfg as any), restProb: Math.max(0, Math.min(0.95, Number(e.target.value) || 0.3)) } })
                        }
                      />
                    </Field>
                    <div className="hidden sm:block" />
                  </>
                )}
              </div>
            </div>

            {/* Lyrics (fixed policy) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3">
              <Field label="Lyrics">
                <div className="text-sm">
                  Uses <span className="font-semibold">solfege</span> by default (mode-aware, movable-do).
                  You can override with custom words below or by importing a MIDI with karaoke lyrics.
                </div>
              </Field>
              <div className="hidden sm:block" />
            </div>
          </div>

          {/* MIDI Import */}
          <div className="rounded-lg border border-[#d2d2d2] bg-[#ebebeb] p-3">
            <div className="text-[11px] uppercase tracking-wide text-[#6b6b6b] mb-2">
              Import MIDI (optional)
            </div>
            <div className="flex items-center gap-2">
              <input
                type="file"
                accept=".mid,.midi"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) onMidiFile(f);
                }}
              />
              {cfg.customPhrase ? (
                <button
                  type="button"
                  className="px-2 py-1 rounded-md bg-white border border-[#d2d2d2] text-sm"
                  onClick={() => {
                    setCfg((c: SessionConfig): SessionConfig => ({ ...c, customPhrase: null, customWords: null }));
                    setPhraseJson("");
                    setCustomLyrics("");
                  }}
                >
                  Clear
                </button>
              ) : null}
            </div>
            <div className="text-xs text-[#6b6b6b] mt-1">
              Reads Type 0/1, tempo changes, melody line (highest note when chords occur), and karaoke lyrics.
            </div>
          </div>
        </div>

        {/* Overrides */}
        <div className="w-full max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-3">
          <div className="rounded-lg border border-[#d2d2d2] bg-[#ebebeb] p-3">
            <div className="text-[11px] uppercase tracking-wide text-[#6b6b6b] mb-2">
              Advanced overrides (optional)
            </div>
            <Field label="Custom Phrase (JSON)">
              <textarea
                className="w-full min-h-[140px] rounded-md border border-[#d2d2d2] bg-white px-2 py-1 text-sm font-mono"
                placeholder='{"durationSec": 4, "notes":[{"midi":60,"startSec":0,"durSec":0.5}]}'
                value={phraseJson}
                onChange={(e) => setPhraseJson(e.target.value)}
              />
              <div className="text-xs text-[#6b6b6b] mt-1">
                If provided, the game uses this phrase as-is (ignores generated notes).
              </div>
            </Field>
          </div>

          <div className="rounded-lg border border-[#d2d2d2] bg-[#ebebeb] p-3">
            <div className="text-[11px] uppercase tracking-wide text-[#6b6b6b] mb-2">Custom Lyrics</div>
            <Field label="Words (comma-separated)">
              <textarea
                className="w-full min-h-[100px] rounded-md border border-[#d2d2d2] bg-white px-2 py-1 text-sm"
                placeholder="see, the, bright, moon"
                value={customLyrics}
                onChange={(e) => setCustomLyrics(e.target.value)}
              />
              <div className="text-xs text-[#6b6b6b] mt-1">
                Maps 1:1 to notes. If counts don’t match, we trim/pad with “la”.
              </div>
            </Field>
          </div>
        </div>

        <div className="w-full max-w-7xl mx-auto">
          <button
            type="button"
            onClick={launch}
            className="px-4 py-2 rounded-md border border-[#d2d2d2] bg-[#f0f0f0] text-[#0f0f0f] text-sm hover:bg-white transition shadow-sm"
            title="Begin session"
          >
            Start session →
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 mb-2">
      <div className="text-[11px] uppercase tracking-wide text-[#6b6b6b]">{label}</div>
      {children}
    </div>
  );
}
