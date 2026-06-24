import { describe, expect, it } from 'vitest';
import {
  SCROLLS,
  SCROLL_POOL,
  SCROLL_TUNING,
  IMPLEMENTED_SCROLLS,
  pickScrollForFloor,
  scrollBand,
  scrollDisplayName,
  scrollDefinition,
} from './scrolls';
import { SCROLL_TYPES } from './itemVisuals';
import { makeRng } from './rng';
import type { ScrollType } from './types';

/** The risky/dud roles whose share of spawns must stay rare under visible names. */
const RARE_ROLES = new Set(['risky', 'dud']);

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
    expect(scrollDisplayName('monster_detection')).toBe('Scroll of Monster Detection');
    expect(scrollDisplayName('blank_paper')).toBe('Blank Paper');
  });
});

describe('scroll spawn tuning', () => {
  it('assigns a role/weight to every implemented scroll', () => {
    for (const type of IMPLEMENTED_SCROLLS) {
      expect(SCROLL_TUNING[type], `missing tuning for ${type}`).toBeDefined();
    }
  });

  it('never tunes a scroll that is not implemented', () => {
    for (const type of Object.keys(SCROLL_TUNING) as ScrollType[]) {
      expect(IMPLEMENTED_SCROLLS.has(type), `${type} tuned but not implemented`).toBe(true);
    }
  });

  it('keeps every implemented scroll in the spawn pool', () => {
    const pooled = new Set(SCROLL_POOL.map(e => e.type));
    for (const type of IMPLEMENTED_SCROLLS) {
      expect(pooled.has(type), `${type} not in pool`).toBe(true);
    }
  });

  it('buckets floors into early/mid/deep bands', () => {
    expect(scrollBand(1)).toBe('early');
    expect(scrollBand(6)).toBe('early');
    expect(scrollBand(7)).toBe('mid');
    expect(scrollBand(12)).toBe('mid');
    expect(scrollBand(13)).toBe('deep');
    expect(scrollBand(20)).toBe('deep');
  });
});

describe('SCROLL_POOL spawn weighting', () => {
  it('has non-negative band weights and a valid type for every entry', () => {
    for (const entry of SCROLL_POOL) {
      expect(SCROLLS[entry.type]).toBeDefined();
      expect(entry.early).toBeGreaterThanOrEqual(0);
      expect(entry.mid).toBeGreaterThanOrEqual(0);
      expect(entry.deep).toBeGreaterThanOrEqual(0);
      // Every pooled scroll must be spawnable in at least one band.
      expect(entry.early + entry.mid + entry.deep).toBeGreaterThan(0);
    }
  });

  it('keeps risky and dud scrolls eligible but rare across floors', () => {
    const rng = makeRng(20240623);
    for (const floor of [1, 3, 7, 13, 20]) {
      const counts = new Map<ScrollType, number>();
      const N = 5000;
      for (let i = 0; i < N; i++) {
        const type = pickScrollForFloor(floor, rng);
        counts.set(type, (counts.get(type) ?? 0) + 1);
      }
      let rare = 0;
      for (const [type, n] of counts) {
        if (RARE_ROLES.has(SCROLL_TUNING[type]?.role ?? '')) rare += n;
      }
      // Useful scrolls dominate; risky+dud stay well under a sane ceiling.
      expect(rare / N, `floor ${floor} risky/dud share`).toBeLessThan(0.15);
    }
  });

  it('still surfaces a risky scroll occasionally (not removed entirely)', () => {
    const rng = makeRng(7);
    const seen = new Set<ScrollType>();
    for (let i = 0; i < 5000; i++) seen.add(pickScrollForFloor(7, rng));
    // At least one risky/dud scroll shows up in a large sample.
    const anyRare = [...seen].some(t => RARE_ROLES.has(SCROLL_TUNING[t]?.role ?? ''));
    expect(anyRare).toBe(true);
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
    expect(seen[3].has('monster_detection')).toBe(false);
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
