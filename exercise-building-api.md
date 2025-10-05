# No‑BS Exercise Building API (smSynth)

> Concise, complete, copy‑paste reference for authoring **exercises** (lessons) via the registry. Lists **every field** with types, defaults, and notes. Use this to build `Partial<SessionConfig>` inside `lib/courses/*`.

---

## 0) Minimal template

```ts
// lib/courses/<your-course>/index.ts
import type { CourseDef } from "../types";

const COURSE: CourseDef = {
  slug: "my-course",
  title: "My Course",
  lessons: [
    {
      slug: "my-exercise",
      title: "My Exercise",
      config: {
        bpm: 80,
        ts: { num: 4, den: 4 },
        leadBars: 1,
        restBars: 1,
        // Either drive via rhythm.lengthBars or (legacy) exerciseBars:
        // exerciseBars: 2,
        noteValue: "quarter",
        // noteDurSec: 0.5, // ← overrides noteValue if set
        lyricStrategy: "solfege",
        scale: { name: "major", tonicPc: 0, randomTonic: false },
        rhythm: {
          mode: "random",
          available: ["quarter"],
          lengthBars: 2,
          // Blue line UI extras (cast needed in author files):
          lineEnabled: true,
          detectEnabled: true,
          allowRests: false,
          restProb: 0.0,
          // Melody content rest knobs:
          contentAllowRests: false,
          contentRestProb: 0.0,
        } as any,
        customPhrase: null,
        customWords: null,
        view: "piano",
        metronome: true,
        callResponse: true, // legacy; prefer callResponseSequence
        advancedMode: false,
        callResponseSequence: [],
        exerciseLoops: 10,
        regenerateBetweenTakes: false,
        loopingMode: true,
        tonicMidis: null, // will be set by resolver if randomTonic
        randomIncludeUnder: false,
        randomIncludeOver: false,
        allowedDegrees: null,
        allowedMidis: null, // legacy absolute MIDI whitelist
        preferredOctaveIndices: [1],
        gestureLatencyMs: 90,
      },
    },
  ],
};

export default COURSE;
```

---

## 1) Types you author

```ts
export type LessonDef = {
  slug: string;
  title: string;
  summary?: string;
  config: Partial<SessionConfig>;
};

export type CourseDef = {
  slug: string;
  title: string;
  subtitle?: string;
  lessons: LessonDef[];
};
```

Lessons are **preset session configs**. At runtime, these merge with defaults and pass through a resolver (random key, clamping, window selection).

---

## 2) `SessionConfig` — Top‑level fields (complete)

| Field | Type | Default | Notes |
|---|---|---:|---|
| `bpm` | `number` | **80** | Global tempo. |
| `ts` | `{ num: number; den: number }` | **{4,4}** | Time signature. |
| `leadBars` | `number` | **1** | Count‑in bars before first take. |
| `restBars` | `number` | **1** | Bars of rest between takes. |
| `exerciseBars` | `number` | **2** | **Legacy**: used if `rhythm.lengthBars` is unset. |
| `noteValue` | `NoteValue` | **"quarter"** | Convenience duration. |
| `noteDurSec` | `number` | **0.5** | **Overrides** `noteValue` if set. |
| `lyricStrategy` | `"solfege"` | **"solfege"** | Lyric rendering strategy. |
| `scale` | `ScaleConfig` | see below | Key/scale and random‑key behavior. |
| `rhythm` | `RhythmConfig` (+ UI extras) | see below | Melody rhythm + blue “rhythm line”. |
| `customPhrase` | `Phrase \| null` | **null** | If set, overrides generation. |
| `customWords` | `string[] \| null` | **null** | Optional lyrics for phrase. |
| `view` | `"piano" \| "sheet"` | **"piano"** | Visual mode. |
| `metronome` | `boolean` | **true** | Clicks during lead‑in. |
| `callResponse` | `boolean` | **true** | **Legacy**; prefer `callResponseSequence`. |
| `advancedMode` | `boolean` | **false** | Reserved UI flag. |
| `callResponseSequence` | `CRMode[]` | **[]** | Pre‑test stages. |
| `exerciseLoops` | `number` | **10** | Takes per session. |
| `regenerateBetweenTakes` | `boolean` | **false** | Regenerate phrase each loop. |
| `loopingMode` | `boolean` | **true** | Auto‑continue after REST. |
| `tonicMidis` | `number[] \| null` | **null** | One or more tonic windows `[T, T+12]`. |
| `randomIncludeUnder` | `boolean` | **false** | Allow random notes below lowest window. |
| `randomIncludeOver` | `boolean` | **false** | Allow random notes above highest window. |
| `allowedDegrees` | `number[] \| null` | **null** | Whitelist of scale‑degree indices **0‑based**. |
| `allowedMidis` | `number[] \| null` | **null** | **Legacy** absolute MIDI whitelist. |
| `preferredOctaveIndices` | `number[] \| null` | **[1]** | Window preference when picking random key (index 0 = first window). |
| `gestureLatencyMs` | `number` | **90** | Vision‑tap compensation. |

**Range clamp note:** If a student range is saved, runtime limits keys/windows. For random key, only tonics/window pairs that form at least one full `[T, T+12]` inside range are eligible.

---

## 3) `ScaleConfig`

| Field | Type | Default | Notes |
|---|---|---:|---|
| `tonicPc` | `0..11` | **0 (C)** | Required in type; ignored at launch iff `randomTonic: true`. |
| `name` | `ScaleName` | **"major"** | See allowed names below. |
| `maxPerDegree` | `number` | **2** | Soft cap on consecutive hits per degree (random). |
| `seed` | `number` | **0xC0FFEE** | RNG seed. |
| `randomTonic` | `boolean` | **false** | If true, resolver picks a key/window to fit saved range, then flips to false. |

**`ScaleName` values:**  
`major`, `natural_minor`, `harmonic_minor`, `melodic_minor`, `dorian`, `phrygian`, `lydian`, `mixolydian`, `locrian`, `major_pentatonic`, `minor_pentatonic`, `chromatic`.

---

## 4) `RhythmConfig` (content) + Blue‑line **UI extras**

The same `rhythm` object carries **content** (melody generation) and **blue rhythm line** controls. The UI extras aren’t in the strict union; in author files keep `as any` on `rhythm` when you include them.

### 4.1 Common knobs (all modes)

- `available?: NoteValue[]`
- **Blue line:** `allowRests?: boolean`, `restProb?: number`
- **Melody:** `contentAllowRests?: boolean`, `contentRestProb?: number`
- `lengthBars?: number`
- `seed?: number`

**`NoteValue` strings:**  
`whole`, `dotted-half`, `half`, `dotted-quarter`, `triplet-quarter`, `quarter`, `dotted-eighth`, `triplet-eighth`, `eighth`, `dotted-sixteenth`, `triplet-sixteenth`, `sixteenth`, `thirtysecond`

Triplets normalize in contiguous 3s; bars are guaranteed to tile (tiny filler durations may be injected).

### 4.2 Modes

**Mode `"random"`**
```ts
{
  mode: "random",
  available?: NoteValue[],
  // Blue line:
  allowRests?: boolean,
  restProb?: number,
  // Melody:
  contentAllowRests?: boolean,
  contentRestProb?: number,
  lengthBars?: number,
  seed?: number,
}
```

**Mode `"sequence"` (scalar patterns)**
```ts
{
  mode: "sequence",
  pattern: "asc" | "desc" | "asc-desc" | "desc-asc",
  available?: NoteValue[],
  // Blue line:
  allowRests?: boolean,
  restProb?: number,
  // Melody:
  contentAllowRests?: boolean,
  contentRestProb?: number,
  lengthBars?: number,
  seed?: number,
}
```

**Mode `"interval"` (fixed jumps)**
```ts
{
  mode: "interval",
  intervals: number[],   // semitones, e.g. [3,4,7,12]
  numIntervals: number,  // pairs per take; one bar per pair
  available?: NoteValue[],
  // Blue line:
  allowRests?: boolean,
  restProb?: number,
  // Melody:
  contentAllowRests?: boolean,
  contentRestProb?: number,
  seed?: number,
}
```

### 4.3 Blue‑line UI extras (lived on `rhythm`, used by game)

- `lineEnabled?: boolean` (default **true**)
- `detectEnabled?: boolean` (default **true**)

---

## 5) `CRMode` (pre‑test sequence)

`callResponseSequence: CRMode[]` — executed in array order. Empty array skips pre‑test.

| `kind` | Behavior |
|---|---|
| `"single_tonic"` | Student matches a single reference tonic. |
| `"derived_tonic"` | A440 → student derives tonic. |
| `"guided_arpeggio"` | Prompted arpeggio from “teacher”. |
| `"internal_arpeggio"` | Silent/internal arpeggio; no prompt. |

---

## 6) Random‑key launch & octave preference

When `scale.randomTonic === true` and a saved range exists:

1. Pick a `tonicPc` whose key yields **≥1 full window** inside the range.  
2. Build candidate windows for that key.  
3. Choose the window using `preferredOctaveIndices` (**index 0 = first window**; default `[1]`).  
4. Set `tonicMidis = [chosenWindow]` and **flip** `randomTonic` to `false` in the resolved session.

If your preferred index doesn’t exist for a given key, the resolver picks the nearest viable window.

---

## 7) How generators respect constraints (behavioral rules)

- **Random melody pool** = in‑range ∩ in‑scale ∩ (inside `tonicMidis` windows ± spill via `randomIncludeUnder/Over`) ∩ `allowedDegrees` ∩ `allowedMidis` (legacy).  
  *If windows exist, degree whitelist applies **inside windows**; spill uses full scale unless `allowedMidis` restricts it.*
- **Sequence patterns** build diatonic/pentatonic/chromatic steps to quota, map to rhythm, prefer in‑range fit, respect whitelists.
- **Interval training** precomputes valid pairs matching `intervals`; emits one bar per pair; respects windows/whitelists.
- **Blue rhythm line & vision** follow `lineEnabled`, `detectEnabled`, and blue‑line rest flags. Vision alignment uses `gestureLatencyMs`.

---

## 8) Quick recipes (one‑liners)

- Change tempo → `{ bpm: 72 }`
- Sheet view → `{ view: "sheet" }`
- Disable metronome → `{ metronome: false }`
- No auto‑loop → `{ loopingMode: false }`
- Blue line on, camera off, rests 69% → `{ rhythm: { lineEnabled: true, detectEnabled: false, allowRests: true, restProb: 0.69 } as any }`
- Strict windows only (no spill) → **omit** `randomIncludeUnder/Over` (both default **false**)
- Wide vocab random → `{ randomIncludeUnder: true, randomIncludeOver: true }`
- Force exactly two bars regardless of `exerciseBars` → `{ rhythm: { lengthBars: 2 } as any }`

---

## 9) Gotchas

- Always include `scale.tonicPc` in authoring (even if `randomTonic: true`).
- UI extras on `rhythm` (`lineEnabled`, `detectEnabled`, `allowRests`, `restProb`) are not in the strict union — keep `as any` in course files.
- Degree indices are **0‑based** relative to the active scale.
- With saved ranges, fixed keys may be clamped by resolver to a nearby allowed pc to form a valid window.
- Triplets are normalized in contiguous 3s; bars always tile (tiny fillers may be injected).

---

*This page intentionally keeps prose to a minimum while listing every field you can author for exercises.*
