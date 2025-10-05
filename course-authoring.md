# smSynth Course Authoring Guide (Registry + SessionConfig)

> Practical, **copy‑pasteable** reference for building courses and lessons via the registry. It consolidates what the engine supports today and shows how to express it in `lib/courses/*` using `Partial<SessionConfig>`.

---

## 1) Types recap (what you author)

```ts
// lib/courses/types.ts
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

> Lessons are **preset configs**. At runtime we merge them with `DEFAULT_SESSION_CONFIG` and call `resolveLessonToSession(...)` which:
> - Fills defaults
> - If `scale.randomTonic` is true and student range exists, picks a key + window (`tonicMidis`)
> - Optionally clamps a fixed key to range
> - Optionally auto-selects a tonic window if missing

---

## 2) SessionConfig – Complete Authoring Surface

> You set any subset; unspecified fields inherit `DEFAULT_SESSION_CONFIG`.

### 2.1 Top-level fields

| Field | Type | Default | Purpose |
|---|---|---:|---|
| `bpm` | number | **80** | Tempo (global). |
| `ts` | `{ num:number; den:number }` | **{4,4}** | Time signature. |
| `leadBars` | number | **1** | Count-in bars. |
| `restBars` | number | **1** | Rest between takes. |
| `exerciseBars` | number | **2** | Legacy fallback if rhythm length is not specified. |
| `noteValue` | `NoteValue` | **'quarter'** | Convenience note duration basis. |
| `noteDurSec` | number | **0.5** | Explicit seconds per note (overrides `noteValue`). |
| `lyricStrategy` | `'solfege'` | **'solfege'** | Lyric rendering. |
| `scale` | `ScaleConfig` | see below | Scale/key and random-key behavior. |
| `rhythm` | `RhythmConfig` (+ UI extras) | see below | Melody rhythm and the blue “rhythm line”. |
| `customPhrase` | `Phrase \| null` | **null** | If set, overrides generation. |
| `customWords` | `string[] \| null` | **null** | Optional lyrics for phrase. |
| `view` | `'piano' \| 'sheet'` | **'piano'** | View mode. |
| `metronome` | `boolean` | **true** | Clicks during lead-in. |
| `callResponse` | `boolean` | **true** | Legacy flag; use `callResponseSequence`. |
| `advancedMode` | `boolean` | **false** | Reserved UI flag. |
| `callResponseSequence` | `CRMode[]` | **[]** | Pre-test stages. |
| `exerciseLoops` | number | **10** | Takes per session. |
| `regenerateBetweenTakes` | boolean | **false** | Regenerate phrase every take if looping. |
| `loopingMode` | boolean | **true** | Auto-continue after REST. |
| `tonicMidis` | `number[] \| null` | **null** | One or more tonic “windows” \[T, T+12]. |
| `randomIncludeUnder` | boolean | **false** | Random melody may spill below lowest window. |
| `randomIncludeOver` | boolean | **false** | Random melody may spill above highest window. |
| `allowedDegrees` | `number[] \| null` | **null** | Whitelist of scale-degree indices (0-based). |
| `allowedMidis` | `number[] \| null` | **null** | Legacy: absolute MIDI whitelist. |
| `preferredOctaveIndices` | `number[] \| null` | **[1]** | Random-key window preference (index 0 = first window). |
| `gestureLatencyMs` | number | **90** | Vision-tap timing compensation. |

**Range clamp note:** With saved range, runtime limits possible keys/windows. For random key, only tonics that produce at least one full window inside the range are eligible.

---

### 2.2 `ScaleConfig`

| Field | Type | Default | Notes |
|---|---|---:|---|
| `tonicPc` | `0..11` | **0 (C)** | Must be present in type; ignored at launch if `randomTonic: true`. |
| `name` | `ScaleName` | **'major'** | `major`, `natural_minor`, `harmonic_minor`, `melodic_minor`, `dorian`, `phrygian`, `lydian`, `mixolydian`, `locrian`, `major_pentatonic`, `minor_pentatonic`, `chromatic`. |
| `maxPerDegree` | number | **2** | Soft-cap on consecutive hits per degree (random melody). |
| `seed` | number | **0xC0FFEE** | RNG seed. |
| `randomTonic` | boolean | **false** | If true, key is chosen to fit saved range; then set to false in resolved session. |

---

### 2.3 `RhythmConfig` (content) + Rhythm **UI extras** (blue line)

The same `rhythm` object houses **content** rhythm (melody generator) and **blue rhythm line** controls. Two kinds of flags:

- **Content** (melody): `contentAllowRests`, `contentRestProb`, `available`, `mode` specifics.
- **Blue line & vision** (UI extras): `lineEnabled`, `detectEnabled`, `allowRests`, `restProb`.

> The UI extras aren’t in the strict union type, so cast your presets with `as any` when you include them.

#### Common knobs (used in all modes)

- `available?: NoteValue[]`
- **Blue line**: `allowRests?: boolean`, `restProb?: number`
- **Melody**: `contentAllowRests?: boolean`, `contentRestProb?: number`
- `lengthBars?: number`
- `seed?: number`

Supported `NoteValue` strings:

```
whole, dotted-half, half, dotted-quarter, triplet-quarter, quarter,
dotted-eighth, triplet-eighth, eighth,
dotted-sixteenth, triplet-sixteenth, sixteenth, thirtysecond
```

Triplets normalize in contiguous 3s; bars are guaranteed to tile (tiny filler durations are injected where needed).

#### Mode: `"random"`
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

#### Mode: `"sequence"` (scalar patterns)
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

#### Mode: `"interval"` (fixed jumps)
```ts
{
  mode: "interval",
  intervals: number[],    // semitones, e.g. [3, 4, 7, 12]
  numIntervals: number,   // pairs per take; one bar per pair
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

**Rhythm UI extras** (live in `rhythm`, consumed by game):
- `lineEnabled?: boolean` (default **true**)
- `detectEnabled?: boolean` (default **true**)

---

### 2.4 `CRMode` (Pre-test sequence)

| kind | Behavior |
|---|---|
| `single_tonic` | Student matches a single reference tonic. |
| `derived_tonic` | A440 → student derives tonic. |
| `guided_arpeggio` | Prompted arpeggio from “teacher”. |
| `internal_arpeggio` | Silent/internal arpeggio; no prompt. |

Order = array order. Empty array skips pre-test.

---

### 2.5 Random-key launch & octave preference

When `scale.randomTonic === true` and the student has a saved range:

1) Pick a `tonicPc` among keys that have **at least one full window** inside the range.  
2) Build candidate windows for that key.  
3) Choose the window using `preferredOctaveIndices` (index **0 = first window**).  
4) Set `tonicMidis = [chosenWindow]` and **flip** `randomTonic` to `false` in the resolved session.

> If your desired index doesn’t exist for that key, the resolver picks the nearest viable window.

---

## 3) Generators (how configs get interpreted)

**Random melody**  
Allowed note pool = in-range ∩ in-scale ∩ (within `tonicMidis` windows ± spill under/over) ∩ `allowedDegrees` ∩ `allowedMidis` (legacy).  
If windows exist, degree whitelist applies **inside windows**; spill uses full scale unless restricted by `allowedMidis`.

**Sequence patterns**  
Builds diatonic/pentatonic/chromatic steps sized to quota, maps to rhythm, prefers in-range fit, respects whitelists.

**Interval training**  
Precomputes valid pairs matching `intervals`; emits one bar per pair; respects windows/whitelists.

**Blue rhythm line & vision**  
Controlled by `lineEnabled`, `detectEnabled`, and blue-line rest flags. Vision alignment uses `gestureLatencyMs`.

---

## 4) Authoring Examples

> All examples assume `import type { CourseDef } from "../types";`

### A) Simple major scalar (2 bars, quarter notes)
```ts
const EX: CourseDef = {
  slug: "scales",
  title: "Scales",
  lessons: [
    {
      slug: "major-quarters-2b",
      title: "Major — quarters (2 bars)",
      config: {
        scale: { name: "major", tonicPc: 0 },  // fixed C; resolver may clamp to saved range
        rhythm: { mode: "sequence", pattern: "asc-desc", available: ["quarter"], lengthBars: 2 } as any,
        callResponse: false,
        loopingMode: true,
      },
    },
  ],
};
```

### B) Random key, Octave 2 preference (middle window)
```ts
{
  slug: "major-random-oct2",
  title: "Major — random key (Octave 2)",
  config: {
    scale: { name: "major", tonicPc: 0, randomTonic: true },
    preferredOctaveIndices: [1], // index 1 = second available window
    rhythm: { mode: "random", available: ["quarter"], lengthBars: 2 } as any,
  },
}
```

### C) Rhythm line **enabled**, camera **off**, **rests on** with **prob 0.69** (blue line)
```ts
{
  slug: "rhythmline-resty",
  title: "Blue line rests 69%",
  config: {
    scale: { name: "major", tonicPc: 0 },
    rhythm: {
      mode: "random",
      available: ["eighth", "quarter"],
      lengthBars: 2,
      // BLUE LINE (guide + vision):
      lineEnabled: true,
      detectEnabled: false,   // ← disable camera detection
      allowRests: true,
      restProb: 0.69,         // ← your 0.69 setting
      // MELODY (content) optional:
      contentAllowRests: true,
      contentRestProb: 0.2,
    } as any,
  },
}
```

### D) Degree whitelist (major 1–3–5 only)
```ts
{
  slug: "major-1-3-5",
  title: "Major — 1 3 5",
  config: {
    scale: { name: "major", tonicPc: 7 }, // G major
    allowedDegrees: [0, 2, 4],            // 1, 3, 5 in-scale
    rhythm: { mode: "random", available: ["quarter"], lengthBars: 2 } as any,
  },
}
```

### E) Interval drill (m3/M3/P5 + octave)
```ts
{
  slug: "intervals-core",
  title: "Intervals — m3/M3/P5/octave",
  config: {
    scale: { name: "major", tonicPc: 0 },
    rhythm: {
      mode: "interval",
      intervals: [3, 4, 7, 12],
      numIntervals: 8,
      available: ["quarter"],
      // Blue line tuning:
      lineEnabled: true,
      detectEnabled: true,
      allowRests: false,
      restProb: 0.0,
    } as any,
    callResponse: false,
  },
}
```

### F) Full-fat “Scales & Rhythms” syncopation with windows, spill & pretest
```ts
{
  slug: "major-syncopation",
  title: "Major — syncopated eighths",
  summary: "Eighth-note syncopation; rhythm line enabled.",
  config: {
    bpm: 96,
    ts: { num: 4, den: 4 },
    leadBars: 1,
    restBars: 1,
    exerciseLoops: 6,
    loopingMode: true,
    scale: { name: "major", tonicPc: 0, randomTonic: true, maxPerDegree: 2 },
    // prefer mid/upper windows if available
    preferredOctaveIndices: [1, 2],
    // allow spill around windows in random mode
    randomIncludeUnder: false,
    randomIncludeOver: true,
    // degree simplify: avoid 4 & 7 for beginners
    allowedDegrees: [0,1,2,4,5], // omit scale degrees 3 & 6 (0-based major: 0..6)
    rhythm: {
      mode: "random",
      available: ["eighth", "quarter"],
      lengthBars: 2,
      // Blue line
      lineEnabled: true,
      detectEnabled: true,
      allowRests: true,
      restProb: 0.25,
      // Melody
      contentAllowRests: true,
      contentRestProb: 0.15,
    } as any,
    // Optional pretest before first take
    callResponseSequence: [
      { kind: "single_tonic" },
      { kind: "guided_arpeggio" },
    ],
  },
}
```

> **TypeScript tip:** UI extras (`lineEnabled`, `detectEnabled`, `allowRests`, `restProb`) are read by the game but not in the strict union; keep `as any` on `rhythm` in author files.

---

## 5) Placeholders (you don’t need to build every course now)

```ts
// lib/courses/interval-detection/index.ts
import type { CourseDef } from "../types";

const INTERVAL_DETECTION_COURSE: CourseDef = {
  slug: "interval-detection",
  title: "Interval Detection",
  subtitle: "Listening drills",
  lessons: [], // ← fill later
};

export default INTERVAL_DETECTION_COURSE;
```

> Placeholder courses appear in the **All Courses** list (registry order), and route correctly even before lessons exist.

---

## 6) Runtime Resolution (what the engine does for you)

- **Random key**: choose a `tonicPc` that yields a full \[T, T+12] window inside saved range; pick window by `preferredOctaveIndices`; set `tonicMidis = [T]`; set `randomTonic = false`.
- **Clamp fixed key** (optional): if your fixed `tonicPc` cannot form any full window in range, resolver nudges it to a nearby allowed pc when possible.
- **Auto window**: if you supplied `tonicPc` but no `tonicMidis`, resolver picks a sensible window (prefers center of range or your preferred index).
- **Triplet & bar fit**: builders normalize triplets, ensure bars start on notes, soften rest openings, and fill to complete bars.

---

## 7) Authoring Checklist

- [ ] Course module exported with correct `slug`.
- [ ] Course slug added to `INTENDED_ORDER` and `COURSE_MODULES`.
- [ ] Each lesson has a unique, URL-safe `slug`.
- [ ] `scale.tonicPc` present (even if `randomTonic: true`).
- [ ] For rhythm **UI extras**, remember `as any`.
- [ ] If you want: `lineEnabled`, `detectEnabled`, `allowRests`, `restProb`.
- [ ] Use `preferredOctaveIndices` to center random-key windows where you expect.
- [ ] If simplifying pitch vocab: `allowedDegrees`.
- [ ] For strong rhythm content control: set `available` + `contentAllowRests` + `contentRestProb`.
- [ ] Add `callResponseSequence` to gate exercises with pre-test.

---

## 8) Quick Recipes

- **Change tempo:** `config: { bpm: 72 }`
- **Switch to sheet view:** `config: { view: "sheet" }`
- **Disable metronome:** `config: { metronome: false }`
- **No auto-loop:** `config: { loopingMode: false }`
- **Blue line on, camera off, with rests 69%:** *(as shown above)*  
- **Strict windows only (no spill):** omit `randomIncludeUnder/Over` (defaults false)
- **Wide vocab random:** `randomIncludeUnder: true, randomIncludeOver: true`
- **Force exactly two bars even if `exerciseBars` changes:** set `rhythm.lengthBars: 2`
