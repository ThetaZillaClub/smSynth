// utils/phrase/index.ts
export type { RhythmEvent, Rat } from "./phraseTypes";
export { totalBeatsRat, rhythmBars, fitRhythmToBars } from "./rhythmBarFit";
export {
  buildEqualRhythm,
  buildRandomRhythmBasic,
  buildRandomRhythmSyncopated,
  buildTwoBarRhythm,
  buildBarsRhythmForQuota,
} from "./rhythmBuilders";
export {
  buildPhraseFromScaleWithRhythm,
  buildPhraseFromScaleSequence,
  sequenceNoteCountForScale,
  buildIntervalPhrase,
  type BuildIntervalPhraseParams,
  // ⛔️ type RootPreference – removed
} from "./phraseBuilders";
