import { describe, expect, it } from 'vitest';
import { SCROLLS, SCROLL_POOL, pickScrollForFloor, scrollDisplayName, scrollDefinition } from './scrolls';
import { SCROLL_TYPES } from './itemVisuals';
import { makeRng } from './rng';
import type { ScrollType } from './types';

describe('scroll registry', () => {
  it('defines every ScrollType exactly once', () => {
    const keys = Object.keys(SCROLLS).sort();
    expect(keys).toEqual([...SCROLL_TYPES].sort());
  });

  it('keeps each definition self-consistent', () => {
    for (const type of SCROLL_TYPES) {
      const def = scrollDefinition(type);
      expect(def.type).toBe(type);
      expect(def.minFloor).toBeGreaterThanOrEqual(1);
      expect(def.summary.length).toBeGreaterThan(0);
      expect(def.detail.length).toBeGreaterThan(0);
    }
  });

  it('renders display names with the right prefix', () => {
    expect(scrollDisplayName('light')).toBe('Scroll of Light');
    expect(scrollDisplayName('magic_mapping')).toBe('Scroll of Magic Mapping');
    expect(scrollDisplayName('blank_paper')).toBe('Blank Paper');
  });
});

describe('SCROLL_POOL spawn weighting', () => {
  it('has a positive weight and a valid type for every entry', () => {
    for (const entry of SCROLL_POOL) {
      expect(entry.weight).toBeGreaterThan(0);
      expect(SCROLLS[entry.type]).toBeDefined();
    }
  });

  it('never spawns a scroll below its min floor', () => {
    const rng = makeRng(1234);
    const seen: Record<number, Set<ScrollType>> = {};
    for (const floor of [1, 3, 5, 7, 9, 13]) {
      seen[floor] = new Set();
      for (let i = 0; i < 500; i++) {
        const type = pickScrollForFloor(floor, rng);
        seen[floor].add(type);
        expect(SCROLLS[type].minFloor).toBeLessThanOrEqual(floor);
      }
    }
    // Floor 1 should never surface a deep scroll like aggravate (minFloor 7).
    expect(seen[1].has('aggravate_monsters')).toBe(false);
    // Common floor-1 utility scrolls should appear early.
    expect(seen[1].has('light')).toBe(true);
  });

  it('always returns a defined type even on floor 1', () => {
    const rng = makeRng(99);
    for (let i = 0; i < 50; i++) {
      expect(SCROLLS[pickScrollForFloor(1, rng)]).toBeDefined();
    }
  });
});
