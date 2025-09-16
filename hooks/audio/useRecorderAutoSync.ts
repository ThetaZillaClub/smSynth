// hooks/audio/useRecorderAutoSync.ts
"use client";

import { useEffect, useRef } from "react";

type Asyncish = void | Promise<unknown>;

type Props = {
  enabled: boolean;
  shouldRecord: boolean;
  isRecording: boolean;
  startRec: () => Asyncish; // allow any return shape
  stopRec: () => Asyncish;  // allow any return shape
  onStarted?: () => void;
  onStopped?: () => void;
};

/**
 * Starts/stops the recorder based on `enabled` and `shouldRecord`.
 * Handles reentrancy with an internal lock and exposes optional callbacks.
 */
export default function useRecorderAutoSync({
  enabled,
  shouldRecord,
  isRecording,
  startRec,
  stopRec,
  onStarted,
  onStopped,
}: Props) {
  const lockRef = useRef({ starting: false, stopping: false });
  const onStartedRef = useRef(onStarted);
  const onStoppedRef = useRef(onStopped);

  useEffect(() => {
    onStartedRef.current = onStarted;
  }, [onStarted]);

  useEffect(() => {
    onStoppedRef.current = onStopped;
  }, [onStopped]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      // If disabled, force stop.
      if (!enabled) {
        if (isRecording && !lockRef.current.stopping) {
          lockRef.current.stopping = true;
          try {
            await stopRec();
            if (!cancelled) onStoppedRef.current?.();
          } finally {
            lockRef.current.stopping = false;
          }
        }
        return;
      }

      // Need to start
      if (shouldRecord && !isRecording && !lockRef.current.starting) {
        lockRef.current.starting = true;
        try {
          await startRec();
          if (!cancelled) onStartedRef.current?.();
        } finally {
          lockRef.current.starting = false;
        }
        return;
      }

      // Need to stop
      if (!shouldRecord && isRecording && !lockRef.current.stopping) {
        lockRef.current.stopping = true;
        try {
          await stopRec();
          if (!cancelled) onStoppedRef.current?.();
        } finally {
          lockRef.current.stopping = false;
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled, shouldRecord, isRecording, startRec, stopRec]);
}
