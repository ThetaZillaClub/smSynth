// components/vision/stage/hooks/useSkeletonDrawer.ts
"use client";
import { useRef } from "react";
type Point = { x: number; y: number };
export type SkeletonOptions = {
  connections: Array<[number, number]>;
  drawEveryN?: number;
  tipIndex?: number;
  objectContain?: boolean;
  pulseMs?: number;
  mirrorX?: boolean; // ← add this for mirrored selfie previews
};
export default function useSkeletonDrawer(
  canvasRef: React.RefObject<HTMLCanvasElement | null>,
  videoRef: React.RefObject<HTMLVideoElement | null>,
  opts: SkeletonOptions
) {
  const {
    connections,
    drawEveryN = 1,
    tipIndex = 8,
    objectContain = true,
    pulseMs = 140,
    mirrorX = false,
  } = opts;
  const drawSkipRef = useRef(0);
  const requiredCount = Math.max(...connections.flat()) + 1;
  const highlightUntilRef = useRef(0);
  const cssCanvasSize = (canvas: HTMLCanvasElement) => {
    const dpr = Math.max(1, canvas.width / Math.max(1, canvas.clientWidth));
    return { w: canvas.width / dpr, h: canvas.height / dpr };
  };
  const mapToCanvas = (nx: number, ny: number, canvas: HTMLCanvasElement, video: HTMLVideoElement) => {
    if (mirrorX) nx = 1 - nx;
    const { w: cw, h: ch } = cssCanvasSize(canvas);
    const vw = video.videoWidth || 1, vh = video.videoHeight || 1;
    const scale = objectContain ? Math.min(cw / vw, ch / vh) : Math.max(cw / vw, ch / vh);
    const dw = vw * scale, dh = vh * scale;
    const offX = (cw - dw) / 2, offY = (ch - dh) / 2;
    return { x: offX + nx * dw, y: offY + ny * dh };
  };
  const clear = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const g = canvas.getContext("2d");
    if (!g) return;
    const { w, h } = cssCanvasSize(canvas);
    g.clearRect(0, 0, w, h);
  };
  const pulse = (ms: number = pulseMs) => {
    highlightUntilRef.current = performance.now() + ms;
  };
  const draw = (landmarks: Array<Point> | null | undefined) => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;
    if (!landmarks || landmarks.length < requiredCount) {
      clear();
      return;
    }
    const skip = (drawSkipRef.current = (drawSkipRef.current + 1) % drawEveryN);
    if (skip !== 0) return;
    const g = canvas.getContext("2d");
    if (!g) return;
    const { w, h } = cssCanvasSize(canvas);
    g.clearRect(0, 0, w, h);
    const isPulse = performance.now() < highlightUntilRef.current;
    const stroke = isPulse ? "rgba(68,255,120,0.95)" : "rgba(255,255,255,0.9)";
    const fill = stroke;
    g.lineWidth = 2;
    g.strokeStyle = stroke;
    g.fillStyle = fill;
    g.beginPath();
    for (const [a, b] of connections) {
      const pa = mapToCanvas(landmarks[a].x, landmarks[a].y, canvas, video);
      const pb = mapToCanvas(landmarks[b].x, landmarks[b].y, canvas, video);
      g.moveTo(pa.x, pa.y);
      g.lineTo(pb.x, pb.y);
    }
    g.stroke();
    for (let i = 0; i < landmarks.length; i++) {
      const p = mapToCanvas(landmarks[i].x, landmarks[i].y, canvas, video);
      const r = i === tipIndex ? 4 : 3;
      g.beginPath();
      g.arc(p.x, p.y, r, 0, Math.PI * 2);
      g.fill();
    }
  };
  return { draw, clear, pulse };
}