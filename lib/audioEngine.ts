// lib/audioEngine.ts
// Shared AudioContext + safe AudioWorklet helpers for SPA routing.

let ctxSingleton: AudioContext | null = null;
let workletReady: Promise<void> | null = null;

function makeAC(): AudioContext {
  const w =
    typeof window !== 'undefined'
      ? (window as Window & {
          webkitAudioContext?: typeof AudioContext;
          AudioContext?: typeof AudioContext;
        })
      : undefined;

  const AC = w?.AudioContext ?? w?.webkitAudioContext;
  if (!AC) throw new Error('AudioContext not available');
  return new AC({ sampleRate: 48000 });
}

/** Get a shared AudioContext (re-create if it was closed). */
export function getAudioContext(): AudioContext {
  if (!ctxSingleton || ctxSingleton.state === 'closed') ctxSingleton = makeAC();
  return ctxSingleton;
}

/** Wait until the page is visible (helps during router transitions). */
async function waitUntilVisible(): Promise<void> {
  if (typeof document === 'undefined') return;
  if (document.visibilityState === 'visible') return;
  await new Promise<void>((res) => {
    const onVis = () => {
      if (document.visibilityState === 'visible') {
        document.removeEventListener('visibilitychange', onVis);
        res();
      }
    };
    document.addEventListener('visibilitychange', onVis);
  });
}

/** Load the worklet module once, and ensure the AC is resumed. */
export async function ensureAudioWorkletLoaded(
  ctx = getAudioContext()
): Promise<void> {
  if (workletReady) return workletReady;
  workletReady = (async () => {
    await waitUntilVisible();
    if (ctx.state === 'suspended') {
      try {
        await ctx.resume();
      } catch {}
    }
    if (ctx.state === 'closed') {
      ctxSingleton = makeAC();
      ctx = ctxSingleton;
    }
    await ctx.audioWorklet.addModule('/audio-processor.js');
  })();
  return workletReady;
}

/** Safe constructor with a single retry on the next animation frame. */
export async function createAudioProcessorNode(
  opts: { bufferSize: number },
  ctx = getAudioContext()
): Promise<AudioWorkletNode> {
  const construct = () =>
    new AudioWorkletNode(ctx, 'audio-processor', {
      processorOptions: { bufferSize: opts.bufferSize },
    });

  try {
    return construct();
  } catch {
    await new Promise<void>((r) => requestAnimationFrame(() => r()));
    try {
      if (ctx.state === 'suspended') await ctx.resume();
    } catch {}
    return construct();
  }
}

export async function resumeAudio() {
  try {
    await getAudioContext().resume();
  } catch {}
}

export async function suspendAudio() {
  try {
    await getAudioContext().suspend();
  } catch {}
}
