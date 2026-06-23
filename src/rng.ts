/**
 * Seedable pseudo-random number generator.
 *
 * The whole game draws randomness from an injected `RNG` rather than calling
 * `Math.random()` directly. That makes dungeons, loot, and combat fully
 * reproducible from a seed — which is what lets tests assert on generated
 * output and enables features like shareable/daily seeds later on.
 */
export interface RNG {
  /** Float in [0, 1). */
  next(): number;
  /** Integer in [0, maxExclusive). */
  int(maxExclusive: number): number;
  /** Integer in [min, maxInclusive]. */
  range(min: number, maxInclusive: number): number;
  /** True with probability `p` (0..1). */
  chance(p: number): boolean;
  /** A uniformly random element of `arr`. */
  pick<T>(arr: readonly T[]): T;
  /** The raw seed this generator was created from. */
  readonly seed: number;
  /**
   * The current internal 32-bit position (unsigned), as it stands BEFORE the
   * next `next()` call. Capture this to snapshot a run, then pass it back as
   * the `state` argument to `makeRng` to resume the exact same stream.
   */
  getState(): number;
}

/** mulberry32 — a compact, fast, well-distributed 32-bit PRNG. */
export function makeRng(seed: number, state?: number): RNG {
  let internalState = state === undefined ? seed >>> 0 : state >>> 0;

  const next = (): number => {
    internalState |= 0;
    internalState = (internalState + 0x6d2b79f5) | 0;
    let t = Math.imul(internalState ^ (internalState >>> 15), 1 | internalState);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const int = (maxExclusive: number): number => Math.floor(next() * maxExclusive);

  return {
    seed,
    next,
    int,
    range: (min, maxInclusive) => min + int(maxInclusive - min + 1),
    chance: (p) => next() < p,
    pick: (arr) => arr[int(arr.length)],
    getState: () => internalState >>> 0,
  };
}

/** A non-deterministic seed for normal play. Tests pass a fixed seed instead. */
export function randomSeed(): number {
  return Math.floor(Math.random() * 0xffffffff) >>> 0;
}
