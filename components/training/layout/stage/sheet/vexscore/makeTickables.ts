// components/training/layout/sheet/vexscore/makeTickables.ts
// Thin wrapper that preserves the existing import path/API.
//
// Before:
//   import { buildMelodyTickables, buildRhythmTickables } from "./makeTickables";
//
// After this refactor that line still works exactly the same.

export { buildMelodyTickables } from "./makeTickables/melody";
export { buildRhythmTickables } from "./makeTickables/rhythm";
