// lib/audioEngine.ts
// Shared AudioContext + safe AudioWorklet helpers for SPA routing.
//
// - Creates a single AC for the entire app (re-created if closed)
// - Loads /audio-processor.js exactly once (awaitable)
// - Safely constructs AudioWorkletNode with a next-frame retry
// - Small helpers to suspend/resume without closing the AC

let ctxSingleton: AudioContext | null = null;
let workletReady: Promise<void> | null = null;

function makeAC(): AudioContext {
  const AC: typeof AudioContext =
    (typeof window !== "undefined" && ((window as any).AudioContext || (window as any).webkitAudioContext)) ||
    (() => { throw new Error("AudioContext not available"); })();
  return new AC({ sampleRate: 48000 });
}

/** Get a shared AudioContext (re-create if it was closed). */
export function getAudioContext(): AudioContext {
  if (!ctxSingleton || ctxSingleton.state === "closed") ctxSingleton = makeAC();
  return ctxSingleton;
}

/** Wait until the page is visible (helps during router transitions). */
async function waitUntilVisible(): Promise<void> {
  if (typeof document === "undefined") return;
  if (document.visibilityState === "visible") return;
  await new Promise<void>((res) => {
    const onVis = () => {
      if (document.visibilityState === "visible") {
        document.removeEventListener("visibilitychange", onVis);
        res();
      }
    };
    document.addEventListener("visibilitychange", onVis);
  });
}

/** Load the worklet module once, and ensure the AC is resum(ed). */
export async function ensureAudioWorkletLoaded(ctx = getAudioContext()): Promise<void> {
  if (workletReady) return workletReady;
  workletReady = (async () => {
    await waitUntilVisible();
    if (ctx.state === "suspended") {
      try { await ctx.resume(); } catch {}
    }
    // In case a previous navigation closed the context mid-await:
    if (ctx.state === "closed") {
      ctxSingleton = makeAC();
      ctx = ctxSingleton;
    }
    await ctx.audioWorklet.addModule("/audio-processor.js");
  })();
  return workletReady;
}

/** Safe constructor with a single retry on the next animation frame. */
export async function createAudioProcessorNode(
  opts: { bufferSize: number },
  ctx = getAudioContext()
): Promise<AudioWorkletNode> {
  const construct = () =>
    new AudioWorkletNode(ctx, "audio-processor", {
      processorOptions: { bufferSize: opts.bufferSize },
    });

  try {
    return construct();
  } catch (_e) {
    // Handle “No execution context available” during SPA route settle
    await new Promise((r) => requestAnimationFrame(() => r(null)));
    try { if (ctx.state === "suspended") await ctx.resume(); } catch {}
    return construct();
  }
}

export async function resumeAudio() {
  try { await getAudioContext().resume(); } catch {}
}

export async function suspendAudio() {
  try { await getAudioContext().suspend(); } catch {}
}
