/**
 * Shared AudioContext provider. The SFX service and the music service use the
 * same context so they unlock together on the first gesture and mix through one
 * graph. Created lazily (autoplay policy) and at most once.
 *
 * Returns null when Web Audio is unavailable (tests / SSR), which makes both
 * services degrade to safe no-ops.
 */

type AudioCtor = typeof AudioContext;

function getAudioContextCtor(): AudioCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { AudioContext?: AudioCtor; webkitAudioContext?: AudioCtor };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

let ctx: AudioContext | null = null;
let failed = false;

/** Lazily create (once) the shared AudioContext, or null if unavailable. */
export function ensureAudioContext(): AudioContext | null {
  if (ctx || failed) return ctx;
  const Ctor = getAudioContextCtor();
  if (!Ctor) {
    failed = true;
    return null;
  }
  try {
    ctx = new Ctor();
  } catch {
    failed = true;
    ctx = null;
  }
  return ctx;
}

/** The context if already created, else null (no creation side effect). */
export function getAudioContext(): AudioContext | null {
  return ctx;
}

/** Test-only: drop the singleton so a fresh one can be created. */
export function __resetAudioContextForTest(): void {
  ctx = null;
  failed = false;
}
