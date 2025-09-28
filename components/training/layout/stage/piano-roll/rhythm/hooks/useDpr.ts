import { useMemo } from "react";

export default function useDpr() {
  return useMemo(() => (typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1), []);
}
