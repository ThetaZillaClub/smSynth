"use client";
import { useMemo, useCallback } from "react";
import { secondsPerBeat } from "@/utils/time/tempo";
import { hzToMidi, midiToNoteName } from "@/utils/pitch/pitchMath";
import { pcToSolfege, type SolfegeScaleName } from "@/utils/lyrics/solfege";
import { triadOffsetsForScale } from "@/utils/music/triad";

export function useFooterActions({
  lowHz, bpm, den, tsNum, scaleName, tonicPc, playMidiList,
}: {
  lowHz: number | null; bpm: number; den: number; tsNum: number;
  scaleName: SolfegeScaleName | string; tonicPc: number; playMidiList: (m:number[], d:number)=>Promise<void>|void;
}) {
  const footerTonicMidi = useMemo<number|null>(() => {
    if (lowHz == null) return null;
    const lowM = Math.round(hzToMidi(lowHz));
    const wantPc = ((tonicPc % 12) + 12) % 12;
    for (let m = lowM; m < lowM + 36; m++) if ((((m % 12) + 12) % 12) === wantPc) return m;
    return null;
  }, [lowHz, tonicPc]);

  const footerTonicLabel = useMemo(() => {
    if (footerTonicMidi == null) return "—";
    const n = midiToNoteName(footerTonicMidi, { useSharps: true });
    return `${n.name}${n.octave}`;
  }, [footerTonicMidi]);

  const { third, fifth } = useMemo(() => triadOffsetsForScale(String(scaleName)), [scaleName]);
  const footerArpMidis = useMemo<number[]|null>(() => {
    if (footerTonicMidi == null) return null;
    const r = footerTonicMidi; return [r, r+third, r+fifth, r+third, r];
  }, [footerTonicMidi, third, fifth]);

  const footerArpLabel = useMemo(() => pcToSolfege(tonicPc, tonicPc, String(scaleName) as any), [tonicPc, scaleName]);

  const playFooterTonic = useCallback(async () => {
    if (footerTonicMidi == null) return;
    await playMidiList([footerTonicMidi], Math.max(0.25, Math.min(1.0, secondsPerBeat(bpm, den))));
  }, [footerTonicMidi, playMidiList, bpm, den]);

  const playFooterArp = useCallback(async () => {
    if (!footerArpMidis) return;
    await playMidiList(footerArpMidis, Math.max(0.2, Math.min(0.75, secondsPerBeat(bpm, den))));
  }, [footerArpMidis, playMidiList, bpm, den]);

  return {
    footerTonicMidi,
    footerTonicLabel,
    footerArpMidis,
    footerArpLabel,
    playFooterTonic,
    playFooterArp,
  };
}
