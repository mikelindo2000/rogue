import { describe, it, expect } from 'vitest';
import { assert, devAssert } from './assert';
import { generateLevel } from './map';
import { makeRng } from './rng';

describe('assert', () => {
  it('throws on a falsy condition', () => {
    expect(() => assert(false, 'nope')).toThrow('nope');
    expect(() => assert(0, 'zero')).toThrow();
    expect(() => assert(undefined, 'undef')).toThrow();
  });

  it('passes a truthy condition', () => {
    expect(() => assert(true, 'ok')).not.toThrow();
    expect(() => assert('value', 'ok')).not.toThrow();
    expect(() => assert(1, 'ok')).not.toThrow();
  });
});

describe('devAssert', () => {
  const dev = (import.meta as { env?: { DEV?: boolean } }).env?.DEV;

  it('throws on failure while in DEV/test, no-ops otherwise', () => {
    if (dev) {
      expect(() => devAssert(() => false, 'boom')).toThrow('boom');
      expect(() => devAssert(() => true, 'fine')).not.toThrow();
    } else {
      expect(() => devAssert(() => false, 'boom')).not.toThrow();
    }
  });

  it('only evaluates the thunk in DEV/test', () => {
    let called = false;
    try {
      devAssert(() => {
        called = true;
        return true;
      }, 'x');
    } catch {
      /* ignore */
    }
    expect(called).toBe(Boolean(dev));
  });
});

describe('generateLevel guards', () => {
  it('throws loudly when the board is too small for a room', () => {
    expect(() => generateLevel(1, 5, 10, 10, makeRng(1))).toThrow(/too small/);
  });

  it('never throws for the real board dimensions across seeds', () => {
    for (let seed = 1; seed <= 25; seed++) {
      expect(() => generateLevel(1, 5, 46, 29, makeRng(seed))).not.toThrow();
      expect(() => generateLevel(20, 20, 46, 29, makeRng(seed))).not.toThrow();
    }
  });
});
