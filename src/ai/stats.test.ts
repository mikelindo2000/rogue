import { describe, it, expect } from 'vitest';
import {
  mean,
  variance,
  stdev,
  quantile,
  median,
  wilsonInterval,
  expectedUniformInt,
  clamp,
  clamp01,
} from './stats';

describe('summary stats', () => {
  it('mean/variance/stdev match known values', () => {
    const xs = [2, 4, 4, 4, 5, 5, 7, 9];
    expect(mean(xs)).toBe(5);
    // Sample variance (n-1) of this classic set is 32/7.
    expect(variance(xs)).toBeCloseTo(32 / 7, 10);
    expect(stdev(xs)).toBeCloseTo(Math.sqrt(32 / 7), 10);
  });

  it('handles degenerate samples', () => {
    expect(mean([])).toBe(0);
    expect(variance([5])).toBe(0);
    expect(stdev([])).toBe(0);
  });

  it('quantile uses linear interpolation (type 7) and does not mutate input', () => {
    const xs = [3, 1, 2]; // unsorted on purpose
    expect(quantile(xs, 0)).toBe(1);
    expect(quantile(xs, 1)).toBe(3);
    expect(quantile(xs, 0.5)).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(2.5);
    expect(xs).toEqual([3, 1, 2]); // unchanged
  });

  it('quantile clamps q to [0,1]', () => {
    expect(quantile([1, 2, 3], -5)).toBe(1);
    expect(quantile([1, 2, 3], 5)).toBe(3);
  });
});

describe('wilsonInterval', () => {
  it('stays within [0,1] at the boundaries (k=0 and k=n)', () => {
    const none = wilsonInterval(0, 100);
    expect(none.point).toBe(0);
    expect(none.lower).toBe(0); // clamped, never negative
    expect(none.upper).toBeGreaterThan(0); // but the interval has width
    expect(none.upper).toBeLessThan(0.06);

    const all = wilsonInterval(100, 100);
    expect(all.point).toBe(1);
    expect(all.upper).toBeCloseTo(1, 12); // mathematically 1; FP rounding aside
    expect(all.upper).toBeLessThanOrEqual(1);
    expect(all.lower).toBeLessThan(1);
    expect(all.lower).toBeGreaterThan(0.94);
  });

  it('matches the textbook value for k=50,n=100 at 95%', () => {
    // Known Wilson interval for 50/100: roughly [0.404, 0.596], centered at 0.5.
    const ci = wilsonInterval(50, 100);
    expect(ci.point).toBe(0.5);
    expect(ci.lower).toBeCloseTo(0.4038, 3);
    expect(ci.upper).toBeCloseTo(0.5962, 3);
  });

  it('narrows as n grows', () => {
    const small = wilsonInterval(8, 10);
    const big = wilsonInterval(800, 1000);
    const w = (i: { lower: number; upper: number }) => i.upper - i.lower;
    expect(w(big)).toBeLessThan(w(small));
  });

  it('returns a safe full interval for n=0', () => {
    expect(wilsonInterval(0, 0)).toEqual({ point: 0, lower: 0, upper: 1 });
  });
});

describe('expectedUniformInt', () => {
  it('computes the exact mean of a uniform die', () => {
    // E[int(6)] over {0..5} = 2.5
    expect(expectedUniformInt(6, (i) => i)).toBeCloseTo(2.5, 12);
  });

  it('matches a brute-force average for a nonlinear transform', () => {
    const f = (i: number) => Math.max(1, Math.floor((i + 1 - 2) * 0.5));
    const m = 20;
    let brute = 0;
    for (let i = 0; i < m; i++) brute += f(i);
    brute /= m;
    expect(expectedUniformInt(m, f)).toBeCloseTo(brute, 12);
  });

  it('clamps maxExclusive to >= 1 like the engine guards', () => {
    expect(expectedUniformInt(0, () => 7)).toBe(7);
    expect(expectedUniformInt(-3, () => 7)).toBe(7);
  });
});

describe('clamps', () => {
  it('clamp and clamp01 bound their inputs', () => {
    expect(clamp(5, 0, 3)).toBe(3);
    expect(clamp(-1, 0, 3)).toBe(0);
    expect(clamp(2, 0, 3)).toBe(2);
    expect(clamp01(2)).toBe(1);
    expect(clamp01(-2)).toBe(0);
  });
});
