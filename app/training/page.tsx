// app/training/page.tsx
"use client";

import React, { useMemo, useState, useEffect, useRef, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

import GameLayout from "@/components/game-layout/GameLayout";
import RangeCapture from "@/components/game-layout/range/RangeCapture";
import TrainingSessionPanel from "@/components/game-layout/TrainingSessionPanel";

import usePitchDetection from "@/hooks/usePitchDetection";
import useWavRecorder from "@/hooks/useWavRecorder";
import useUiRecordTimer from "@/hooks/training/useUiRecordTimer";
import usePhraseLyrics from "@/hooks/training/usePhraseLyrics";

import { hzToNoteName } from "@/utils/pitch/pitchMath";
import { encodeWavPCM16 } from "@/utils/audio/wav";

// Defaults (can be overridden via ?on=&off=)
const DEFAULT_ON_SEC = 8;
const DEFAULT_OFF_SEC = 8;
const TRAIN_LEAD_IN_SEC = 1.0;
const NOTE_DUR_SEC = 0.5;
const MAX_TAKES = 24;
const MAX_SESSION_SEC = 15 * 60;
const CONF_THRESHOLD = 0.5;

type ModelRow = {
  id: string;
  creator_display_name: string;
  gender: "male" | "female" | "unspecified" | "other";
};

// Ensure exact take length by padding/truncating the resampled PCM
function normalizeExactLength(
  pcm: Float32Array | null,
  sampleRate: number,
  targetSec: number
): { pcmExact: Float32Array; numSamples: number } {
  const Nwant = Math.max(0, Math.round(targetSec * sampleRate));
  if (!pcm || pcm.length === 0) {
    return { pcmExact: new Float32Array(Nwant), numSamples: Nwant };
  }
  if (pcm.length === Nwant) {
    return { pcmExact: pcm, numSamples: Nwant };
  }
  if (pcm.length > Nwant) {
    return { pcmExact: pcm.slice(0, Nwant), numSamples: Nwant };
  }
  const out = new Float32Array(Nwant);
  out.set(pcm, 0);
  return { pcmExact: out, numSamples: Nwant };
}

export default function Training() {
  const searchParams = useSearchParams();
  const modelIdFromQuery = searchParams.get("model_id") || null;

  // Configurable window (query overrides for quick playtesting)
  const parsePos = (v: string | null) => {
    const n = v ? Number(v) : NaN;
    return Number.isFinite(n) && n > 0 ? n : null;
  };
  const windowOnSec = parsePos(searchParams.get("on")) ?? DEFAULT_ON_SEC;
  const windowOffSec = parsePos(searchParams.get("off")) ?? DEFAULT_OFF_SEC;

  const supabase = useMemo(() => createClient(), []);

  // model → subject + gender + model id (for range updates / later repurposing)
  const [modelRowId, setModelRowId] = useState<string | null>(null);
  const [subjectId, setSubjectId] = useState<string | null>(null);
  const [genderLabel, setGenderLabel] = useState<"male" | "female" | null>(null);

  // fetch model row (by ?model_id, else latest for user)
  useEffect(() => {
    (async () => {
      try {
        const { data: userRes, error: userErr } = await supabase.auth.getUser();
        if (userErr) throw userErr;
        const user = userRes.user;
        if (!user) return;

        let row: ModelRow | null = null;

        if (modelIdFromQuery) {
          const { data, error } = await supabase
            .from("models")
            .select("id, creator_display_name, gender")
            .eq("id", modelIdFromQuery)
            .single();
          if (error) throw error;
          row = data as ModelRow;
        } else {
          const { data, error } = await supabase
            .from("models")
            .select("id, creator_display_name, gender")
            .eq("uid", user.id)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          if (error) throw error;
          row = (data ?? null) as ModelRow | null;
        }

        if (row) {
          setModelRowId(row.id);
          setSubjectId(row.creator_display_name || null);
          setGenderLabel(row.gender === "male" || row.gender === "female" ? row.gender : null);
        } else {
          setModelRowId(null);
          setSubjectId(null);
          setGenderLabel(null);
        }
      } catch {
        setModelRowId(null);
        setSubjectId(null);
        setGenderLabel(null);
      }
    })();
  }, [modelIdFromQuery, supabase]);

  const [step, setStep] = useState<"low" | "high" | "play">("low");
  const [lowHz, setLowHz] = useState<number | null>(null);
  const [highHz, setHighHz] = useState<number | null>(null);

  const { pitch, confidence, isReady, error } = usePitchDetection("/models/swiftf0", {
    enabled: true,
    fps: 50,
    minDb: -45,
    smoothing: 2,
    centsTolerance: 3,
  });

  // phrase + lyrics
  const {
    phrase,
    words,
    reset: resetPhraseLyrics,
    advance: advancePhraseLyrics,
  } = usePhraseLyrics({ lowHz, highHz, lyricStrategy: "mixed", noteDurSec: NOTE_DUR_SEC });

  // recorder
  const {
    isRecording,
    start: startRec,
    stop: stopRec,
    wavBlob,
    startedAtMs,
    sampleRateOut,
    pcm16k,
  } = useWavRecorder({ sampleRateOut: 16000 });

  // wall-clock seconds tied to RECORDER start
  const uiRecordSec = useUiRecordTimer(isRecording, startedAtMs ?? null);

  // loop flags
  const [running, setRunning] = useState(false);
  const [looping, setLooping] = useState(false);
  const [loopPhase, setLoopPhase] = useState<"idle" | "record" | "rest">("idle");
  const [activeWord, setActiveWord] = useState<number>(-1);

  // take count + elapsed guard
  const [takeCount, setTakeCount] = useState(0);
  const countsRef = useRef({ takeCount: 0 });
  useEffect(() => {
    countsRef.current.takeCount = takeCount;
  }, [takeCount]);

  // timers/guards
  const recordTimerRef = useRef<number | null>(null);
  const restTimerRef = useRef<number | null>(null);
  const clearTimers = useCallback(() => {
    if (recordTimerRef.current != null) {
      clearTimeout(recordTimerRef.current);
      recordTimerRef.current = null;
    }
    if (restTimerRef.current != null) {
      clearTimeout(restTimerRef.current);
      restTimerRef.current = null;
    }
  }, []);

  // session window guard
  const sessionStartMsRef = useRef<number | null>(null);

  // mic/pitch text
  const micText = error ? `Mic error: ${String(error)}` : isReady ? "Mic ready" : "Starting mic…";
  const pitchText = typeof pitch === "number" ? `${pitch.toFixed(1)} Hz` : "—";
  const noteText =
    typeof pitch === "number"
      ? (() => {
          const { name, octave, cents } = hzToNoteName(pitch, 440, { useSharps: true, octaveAnchor: "A" });
          const sign = cents > 0 ? "+" : "";
          return `${name}${octave} ${sign}${cents}¢`;
        })()
      : "—";

  // on enter play: reset session state
  useEffect(() => {
    if (step === "play" && lowHz != null && highHz != null) {
      setTakeCount(0);
      clearTimers();
      setLooping(false);
      setRunning(false);
      setLoopPhase("idle");
      resetPhraseLyrics();
      sessionStartMsRef.current = performance.now();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, lowHz, highHz]);

  // start/stop recorder when running flips
  const recLockRef = useRef({ starting: false, stopping: false });
  useEffect(() => {
    (async () => {
      if (step === "play" && running && !isRecording && !recLockRef.current.starting) {
        recLockRef.current.starting = true;
        await startRec();
        recLockRef.current.starting = false;
        return;
      }
      if (isRecording && !running && !recLockRef.current.stopping) {
        recLockRef.current.stopping = true;
        await stopRec();
        recLockRef.current.stopping = false;
      }
    })();
  }, [step, running, isRecording, startRec, stopRec]);

  // write range_low / range_high to Supabase
  const updateRange = useCallback(
    async (which: "low" | "high", label: string) => {
      if (!modelRowId) return;
      const payload = which === "low" ? { range_low: label } : { range_high: label };
      const { error: updErr } = await supabase.from("models").update(payload).eq("id", modelRowId);
      if (updErr) console.warn(`[training] Failed to update ${which} range:`, updErr?.message || updErr);
    },
    [modelRowId, supabase]
  );

  const startRecordPhase = useCallback(() => {
    if (lowHz == null || highHz == null || !phrase || !words) return;

    const elapsed = sessionStartMsRef.current ? (performance.now() - sessionStartMsRef.current) / 1000 : 0;
    if (countsRef.current.takeCount >= MAX_TAKES || elapsed >= MAX_SESSION_SEC) {
      setLooping(false);
      setRunning(false);
      setLoopPhase("idle");
      clearTimers();
      return;
    }
    setLoopPhase("record");
    setRunning(true);
  }, [lowHz, highHz, phrase, words, clearTimers]);

  // EXACT end of record window (aligned to recorder start)
  useEffect(() => {
    if (loopPhase !== "record") {
      if (recordTimerRef.current != null) {
        clearTimeout(recordTimerRef.current);
        recordTimerRef.current = null;
      }
      return;
    }
    if (isRecording && startedAtMs != null && recordTimerRef.current == null) {
      const now = performance.now();
      const delayMs = Math.max(0, windowOnSec * 1000 - (now - startedAtMs));
      recordTimerRef.current = window.setTimeout(() => {
        if (!recLockRef.current.stopping) {
          recLockRef.current.stopping = true;
          void stopRec().finally(() => {
            recLockRef.current.stopping = false;
          });
        }
        setRunning(false);
        setActiveWord(-1);
        setLoopPhase("rest");
        advancePhraseLyrics(); // prep next while we rest
      }, delayMs);
    }
  }, [loopPhase, isRecording, startedAtMs, advancePhraseLyrics, stopRec, windowOnSec]);

  // REST → next take
  useEffect(() => {
    if (loopPhase !== "rest" || !looping) {
      if (restTimerRef.current != null) {
        clearTimeout(restTimerRef.current);
        restTimerRef.current = null;
      }
      return;
    }
    if (!isRecording && restTimerRef.current == null) {
      if (countsRef.current.takeCount >= MAX_TAKES) return;
      restTimerRef.current = window.setTimeout(function tick() {
        restTimerRef.current = null;
        if (countsRef.current.takeCount >= MAX_TAKES) {
          setLooping(false);
          setRunning(false);
          setLoopPhase("idle");
          clearTimers();
        } else {
          startRecordPhase();
        }
      }, windowOffSec * 1000);
    }
  }, [loopPhase, looping, isRecording, clearTimers, startRecordPhase, windowOffSec]);

  // cap guard
  useEffect(() => {
    if (takeCount >= MAX_TAKES) {
      setLooping(false);
      setRunning(false);
      setLoopPhase("idle");
      clearTimers();
    }
  }, [takeCount, clearTimers]);

  // play/pause button
  const handleToggle = useCallback(() => {
    if (step !== "play" || lowHz == null || highHz == null) return;
    if (!looping) {
      setLooping(true);
      clearTimers();
      startRecordPhase();
    } else {
      setLooping(false);
      clearTimers();
      setRunning(false);
      setLoopPhase("idle");
    }
  }, [looping, step, lowHz, highHz, clearTimers, startRecordPhase]);

  // stop if phrase disappears
  useEffect(() => {
    if (step !== "play" || lowHz == null || highHz == null) {
      if (looping) {
        setLooping(false);
        clearTimers();
        setRunning(false);
        setLoopPhase("idle");
      }
    }
  }, [step, lowHz, highHz, looping, clearTimers]);

  // When a take finishes, bump count and produce sample-perfect WAV
  useEffect(() => {
    if (!wavBlob) return;
    setTakeCount((n) => n + 1);

    // Sample-perfect post-processing (pad/truncate to exact windowOnSec at output SR)
    const sr = sampleRateOut || 16000;
    const { pcmExact, numSamples } = normalizeExactLength(pcm16k, sr, windowOnSec);
    const exactBlob = encodeWavPCM16(pcmExact, sr);

    // eslint-disable-next-line no-console
    console.log("[musicianship] take ready", {
      modelRowId,
      subjectId,
      genderLabel,
      windowOnSec,
      windowOffSec,
      sampleRateOut: sr,
      exactSamples: numSamples,
      wavBytesRaw: (wavBlob as Blob).size,
      wavBytesExact: exactBlob.size,
    });
  }, [wavBlob, sampleRateOut, pcm16k, windowOnSec, windowOffSec, modelRowId, subjectId, genderLabel]);

  // cleanup timers on unmount
  useEffect(() => () => { clearTimers(); }, [clearTimers]);

  const statusText =
    loopPhase === "record" ? (isRecording ? "Recording…" : "Playing…")
    : loopPhase === "rest" && looping ? "Breather…"
    : "Idle";

  return (
    <>
      <GameLayout
        title="Training"
        micText={micText}
        error={error}
        running={running}
        uiRunning={looping}
        onToggle={handleToggle}
        phrase={phrase ?? undefined}
        lyrics={step === "play" && words ? words : undefined}
        activeLyricIndex={step === "play" ? activeWord : -1}
        onActiveNoteChange={(idx) => setActiveWord(idx)}
        pitchText={pitchText}
        noteText={noteText}
        confidence={confidence}
        livePitchHz={typeof pitch === "number" ? pitch : null}
        confThreshold={CONF_THRESHOLD}
        startAtMs={isRecording ? startedAtMs ?? null : null}
        leadInSec={TRAIN_LEAD_IN_SEC}
      >
        {step === "low" && (
          <RangeCapture
            mode="low"
            active
            pitchHz={typeof pitch === "number" ? pitch : null}
            bpm={60}
            beatsRequired={1}
            centsWindow={75}
            a4Hz={440}
            onConfirm={(hz) => {
              setLowHz(hz);
              const { name, octave } = hzToNoteName(hz, 440, { useSharps: true, octaveAnchor: "A" });
              const label = `${name}${octave}`;
              void updateRange("low", label);
              setStep("high");
            }}
          />
        )}

        {step === "high" && (
          <RangeCapture
            mode="high"
            active
            pitchHz={typeof pitch === "number" ? pitch : null}
            bpm={60}
            beatsRequired={1}
            centsWindow={75}
            a4Hz={440}
            onConfirm={(hz) => {
              setHighHz(hz);
              const { name, octave } = hzToNoteName(hz, 440, { useSharps: true, octaveAnchor: "A" });
              const label = `${name}${octave}`;
              void updateRange("high", label);
              setStep("play");
            }}
          />
        )}

        {step === "play" && (
          <TrainingSessionPanel
            statusText={statusText}
            isRecording={isRecording}
            uiRecordSec={Math.min(uiRecordSec, windowOnSec)}
            recordSec={windowOnSec}
            restSec={windowOffSec}
            maxTakes={MAX_TAKES}
            maxSessionSec={MAX_SESSION_SEC}
          />
        )}
      </GameLayout>
    </>
  );
}
