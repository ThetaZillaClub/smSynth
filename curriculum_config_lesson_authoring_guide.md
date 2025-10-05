# Curriculum Config & Lesson Authoring Guide

> **Goal:** Move from launching ad‑hoc training sessions to **pre‑composed, reusable lessons** that map directly to your `SessionConfig` model. This guide documents every config you can author, shows patterns for common lesson types, and outlines the app flow to select a course → pick a lesson → launch the game with that lesson’s preset.

---

## 1) Mental model

- **Course**: A themed track (e.g., *Pitch Tune*, *Intervals*). Each course contains an ordered list of **lessons**.
- **Lesson**: A single, pre‑composed training experience that can be launched immediately. A lesson is **just a typed preset**: `Partial<SessionConfig>` + some metadata (title, description, tags, gates).
- **Session**: What the game actually runs. It’s the **merge of** `DEFAULT_SESSION_CONFIG` with the lesson’s partial config (and the student’s saved range constraints at runtime).

```
Course ─┬─ Lesson (Preset A) ──▶ SessionConfig (merged) ─▶ TrainingGame
        └─ Lesson (Preset B) ──▶ SessionConfig (merged) ─▶ TrainingGame
```

---

## 2) Reference: `SessionConfig` and related types

Below are the authorable fields that shape a lesson. **Anything omitted in a lesson uses the default from `DEFAULT_SESSION_CONFIG`.**

### 2.1 `SessionConfig`

| Field | Type | Default | Notes / Authoring guidance |
|---|---|---|---|
| `bpm` | `number` | `80` | Tempo in beats per minute. |
| `ts` | `{ num: number; den: number }` | `{ num:4, den:4 }` | Musical time signature. |
| `leadBars` | `number` | `1` | Lead‑in bars before each take (clicks if `metronome` on). |
| `restBars` | `number` | `1` | Rest bars between takes. |
| `exerciseBars` | `number` | `2` | Legacy; used by rhythm presets as a convenience. |
| `noteValue` | `NoteValue` | `'quarter'` | If set, used to derive default durations. |
| `noteDurSec` | `number` | `0.5` | Explicit seconds per note (overrides `noteValue`). |
| `lyricStrategy` | `'solfege'` | `'solfege'` | Lyric rendering strategy. |
| `scale` | `ScaleConfig` | see below | Key/scale/tonic behavior. |
| `rhythm` | `RhythmConfig` | random‑quarter template | Controls both **melody content rhythm** and the **blue rhythm line** (see cards). |
| `customPhrase` | `Phrase \| null` | `null` | If present, overrides generated melody entirely. Useful for MIDI‑import lessons. |
| `customWords` | `string[] \| null` | `null` | Optional lyrics (e.g., from MIDI karaoke). |
| `view` | `'piano' \| 'sheet'` | `'piano'` | Display mode. |
| `metronome` | `boolean` | `true` | Lead‑in countoff only. |
| `callResponse` | `boolean` | `true` | Legacy; keep `true`. Pre‑test uses `callResponseSequence`. |
| `advancedMode` | `boolean` | `false` | Reserved flag for UI. |
| `callResponseSequence` | `CRMode[]` | `[]` | Pre‑test stages prior to first take. Empty = skip pre‑test. |
| `exerciseLoops` | `number` | `10` | Takes per lesson launch. |
| `regenerateBetweenTakes` | `boolean` | `false` | If `true`, regenerate phrase each take (good for variety drills). |
| `loopingMode` | `boolean` | `true` | If `false`, auto‑pause at REST for review. |
| `tonicMidis` | `number[] \| null` | `null` | **Anchors**: each entry defines a tonic window `[T, T + 12]`. Runtime also clamps to student range. |
| `randomIncludeUnder` | `boolean` | `false` | Random mode may include notes **below** the lowest window. |
| `randomIncludeOver` | `boolean` | `false` | Random mode may include notes **above** the highest window. |
| `allowedDegrees` | `number[] \| null` | `null` | Diatonic degree whitelist (0‑based within scale). `null` = all degrees. |
| `allowedMidis` | `number[] \| null` | `null` | Legacy absolute whitelist. Avoid in new authoring. |
| `preferredOctaveIndices` | `number[] \| null` | `[1]` | For **random‑key** mode: preferred tonic windows by index (Octave 1 = 0). If a chosen key lacks a given window, runtime falls back. |
| `gestureLatencyMs` | `number` | `90` | Compensation for hand‑beat alignment.

### 2.2 `ScaleConfig`

| Field | Type | Default | Notes |
|---|---|---|---|
| `tonicPc` | `0..11` | `0` (C) | When **not** random‑key. Must be compatible with student range. |
| `name` | `ScaleName` | `'major'` | See options list in `SCALE_OPTIONS`. |
| `maxPerDegree` | `number` | `2` | Random‑mode cap: max consecutive hits per degree. |
| `seed` | `number` | `0xC0FFEE` | RNG seed for repeatability. |
| `randomTonic` | `boolean` | `false` | If `true`, key is picked at launch from allowed keys; combined with `preferredOctaveIndices`.

### 2.3 `RhythmConfig`

There are **three modes**:

1) **Random**
```ts
{
  mode: 'random',
  available?: NoteValue[];         // e.g. ['quarter','eighth']
  restProb?: number;               // 0..0.95, for blue line rests
  allowRests?: boolean;            // blue line
  contentRestProb?: number;        // 0..0.95, for melody rests
  contentAllowRests?: boolean;     // melody
  lengthBars?: number;             // defaults to exerciseBars
  seed?: number;
}
```

2) **Sequence** (scalar patterns)
```ts
{
  mode: 'sequence',
  pattern: 'asc' | 'desc' | 'asc-desc' | 'desc-asc',
  available?: NoteValue[];
  restProb?: number;
  allowRests?: boolean;
  contentRestProb?: number;
  contentAllowRests?: boolean;
  lengthBars?: number;             // sequence span in bars
  seed?: number;
}
```

3) **Interval Training** (fixed jumps)
```ts
{
  mode: 'interval',
  intervals: number[];             // in semitones, e.g., [3,5]
  numIntervals: number;            // count per take
  available?: NoteValue[];
  restProb?: number;
  allowRests?: boolean;
  contentRestProb?: number;
  contentAllowRests?: boolean;
  seed?: number;
}
```

### 2.4 `CRMode` (Pre‑test)

| Kind | What happens |
|---|---|
| `single_tonic` | Student matches a single reference tonic. |
| `derived_tonic` | A440 reference → tonic derivation. |
| `guided_arpeggio` | Teacher prompt/guided arpeggio first. |
| `internal_arpeggio` | Silent/internal arpeggio; student establishes key silently.

> **Author tip:** If `callResponseSequence.length > 0`, pre‑test runs **before** the first take. Skip it by leaving empty.

---
