/* Pure statistics kernel for the balance system.
 *
 * Everything here is a pure function of its inputs — no RNG, no state — so the
 * combat model and balancer can be validated against exact math. These are the
 * primitives the rest of src/ai builds on:
 *   - Wilson score interval: an honest confidence interval for a Monte-Carlo
 *     win-rate (far better behaved than the naive normal approximation at the
 *     extremes, which is exactly where balance lives — 0% and 100%).
 *   - Exact expectation of a function of a uniform integer die, so we can
 *     compute closed-form expected damage and cross-check the simulator.
 *   - Standard summary stats (mean/variance/stdev/quantile/median).
 */

/** Arithmetic mean. Returns 0 for an empty sample. */
export function mean(xs: readonly number[]): number {
  if (xs.length === 0) return 0;
  let s = 0;
  for (const x of xs) s += x;
  return s / xs.length;
}

/** Sample variance (Bessel-corrected, n-1). Returns 0 for n < 2. */
export function variance(xs: readonly number[]): number {
  const n = xs.length;
  if (n < 2) return 0;
  const m = mean(xs);
  let s = 0;
  for (const x of xs) s += (x - m) * (x - m);
  return s / (n - 1);
}

export function stdev(xs: readonly number[]): number {
  return Math.sqrt(variance(xs));
}

/**
 * Quantile via linear interpolation between order statistics (the "type 7"
 * definition used by NumPy/R default). `q` is clamped to [0, 1]. Does not
 * mutate the input.
 */
export function quantile(xs: readonly number[], q: number): number {
  if (xs.length === 0) return 0;
  if (xs.length === 1) return xs[0];
  const sorted = [...xs].sort((a, b) => a - b);
  const p = clamp01(q);
  const pos = (sorted.length - 1) * p;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo];
  const frac = pos - lo;
  return sorted[lo] * (1 - frac) + sorted[hi] * frac;
}

export function median(xs: readonly number[]): number {
  return quantile(xs, 0.5);
}

export interface Interval {
  point: number; // point estimate (k / n)
  lower: number;
  upper: number;
}

/**
 * Wilson score interval for a binomial proportion.
 *
 * For `k` successes in `n` trials at confidence `z` (default 1.96 ≈ 95%), this
 * returns the point estimate and a [lower, upper] interval that stays inside
 * [0, 1] and behaves sensibly even when k = 0 or k = n — unlike the textbook
 * `phat ± z·sqrt(phat(1-phat)/n)`, which collapses to a zero-width (and wrong)
 * interval at the boundaries. Win-rates near 0/1 are precisely the cases the
 * balancer cares about, so the interval has to be trustworthy there.
 *
 * Reference: Wilson (1927), "Probable Inference, the Law of Succession, and
 * Statistical Inference".
 */
export function wilsonInterval(k: number, n: number, z = 1.96): Interval {
  if (n <= 0) return { point: 0, lower: 0, upper: 1 };
  const phat = k / n;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const center = (phat + z2 / (2 * n)) / denom;
  const margin =
    (z * Math.sqrt((phat * (1 - phat) + z2 / (4 * n)) / n)) / denom;
  return {
    point: phat,
    lower: Math.max(0, center - margin),
    upper: Math.min(1, center + margin),
  };
}

/**
 * Exact expectation of `f(i)` where `i` is uniform on the integers
 * {0, 1, …, maxExclusive-1} — i.e. the distribution of `RNG.int(maxExclusive)`.
 *
 * The game's damage rolls are all of the form `f(RNG.int(m))`, so this gives a
 * closed-form expected damage with no sampling error. `maxExclusive` is clamped
 * to ≥ 1 to mirror the engine's `Math.max(1, …)` guards.
 */
export function expectedUniformInt(
  maxExclusive: number,
  f: (i: number) => number,
): number {
  const m = Math.max(1, Math.floor(maxExclusive));
  let sum = 0;
  for (let i = 0; i < m; i++) sum += f(i);
  return sum / m;
}

export function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

export function clamp(x: number, lo: number, hi: number): number {
  return x < lo ? lo : x > hi ? hi : x;
}
