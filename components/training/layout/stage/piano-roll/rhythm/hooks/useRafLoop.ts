import { useEffect, useRef } from "react";

type Opts = {
  running: boolean;
  onFrame: (ts: number) => void;
  onStart?: () => void;
  onStop?: () => void;
};

export default function useRafLoop({ running, onFrame, onStart, onStop }: Opts) {
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (running) {
      onStart?.();
      const step = (ts: number) => {
        onFrame(ts);
        rafRef.current = requestAnimationFrame(step);
      };
      rafRef.current = requestAnimationFrame(step);
    } else {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      onStop?.();
    }
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [running, onFrame, onStart, onStop]);
}
