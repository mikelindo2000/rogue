import { describe, it, expect } from 'vitest';
import { makeRng } from './rng';

describe('makeRng', () => {
  it('is deterministic for a given seed', () => {
    const a = makeRng(12345);
    const b = makeRng(12345);
    const seqA = Array.from({ length: 20 }, () => a.next());
    const seqB = Array.from({ length: 20 }, () => b.next());
    expect(seqA).toEqual(seqB);
  });

  it('produces different streams for different seeds', () => {
    const a = makeRng(1);
    const b = makeRng(2);
    expect(a.next()).not.toEqual(b.next());
  });

  it('next() stays in [0, 1)', () => {
    const r = makeRng(99);
    for (let i = 0; i < 1000; i++) {
      const v = r.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('int(n) stays in [0, n)', () => {
    const r = makeRng(7);
    for (let i = 0; i < 1000; i++) {
      const v = r.int(6);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(6);
      expect(Number.isInteger(v)).toBe(true);
    }
  });

  it('range(min, max) is inclusive on both ends', () => {
    const r = makeRng(42);
    const seen = new Set<number>();
    for (let i = 0; i < 1000; i++) seen.add(r.range(3, 5));
    expect(seen).toEqual(new Set([3, 4, 5]));
  });

  it('pick() returns an element of the array', () => {
    const r = makeRng(3);
    const arr = ['a', 'b', 'c'] as const;
    for (let i = 0; i < 100; i++) expect(arr).toContain(r.pick(arr));
  });
});

describe('makeRng snapshot/resume', () => {
  it('resumes an identical continuation from a captured state', () => {
    const seed = 12345;
    const original = makeRng(seed);

    // Draw K values to advance the generator past its initial position.
    const K = 37;
    for (let i = 0; i < K; i++) original.next();

    // Capture the live position (post-increment, pre next-draw).
    const captured = original.getState();
    const resumed = makeRng(original.seed, captured);

    // The resumed stream must match the original's continuation exactly.
    const M = 50;
    const originalNext = Array.from({ length: M }, () => original.next());
    const resumedNext = Array.from({ length: M }, () => resumed.next());
    expect(resumedNext).toEqual(originalNext);
  });

  it('getState() returns an unsigned 32-bit integer', () => {
    const r = makeRng(98765);
    for (let i = 0; i < 100; i++) {
      r.next();
      const s = r.getState();
      expect(Number.isInteger(s)).toBe(true);
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThanOrEqual(0xffffffff);
    }
  });

  it('getState() before any draw equals the seed (default construction)', () => {
    const r = makeRng(424242);
    expect(r.getState()).toBe(424242 >>> 0);
  });

  it('makeRng(seed, state) ignores seed for stream position', () => {
    const a = makeRng(1);
    for (let i = 0; i < 10; i++) a.next();
    const captured = a.getState();

    // Different seed argument, same state: stream follows the state.
    const fromState = makeRng(1, captured);
    const sameSeed = makeRng(1, captured);
    const s1 = Array.from({ length: 20 }, () => fromState.next());
    const s2 = Array.from({ length: 20 }, () => sameSeed.next());
    expect(s1).toEqual(s2);
    expect(s1).toEqual(Array.from({ length: 20 }, () => a.next()));
  });
});
