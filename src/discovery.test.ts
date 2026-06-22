import { describe, it, expect } from 'vitest';
import {
  emptyDiscovery,
  slugify,
  monsterId,
  tierOf,
  markSeen,
  markDefeated,
  discoveredCount,
  hpBand,
  atkBand,
  snapshotDiscovery,
} from './discovery';
import { MONSTER_DATABASE } from './config';

describe('slugify / monsterId', () => {
  it('produces stable, url-safe slugs', () => {
    expect(slugify('Orc')).toBe('orc');
    expect(slugify('Marcus the Brave')).toBe('marcus-the-brave');
    expect(slugify('Kalius King Cobra')).toBe('kalius-king-cobra');
    expect(slugify('M↑')).toBe('m'); // arrow stripped to a clean slug
  });

  it('prefers an explicit id over the name slug', () => {
    expect(monsterId({ id: 'custom', name: 'Whatever' })).toBe('custom');
    expect(monsterId({ name: 'Brown Bat' })).toBe('brown-bat');
  });

  it('yields a unique id for every monster in the database', () => {
    const ids = MONSTER_DATABASE.map((m) => monsterId(m));
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('tiers', () => {
  it('starts every monster unknown', () => {
    const s = emptyDiscovery();
    expect(tierOf(s, 'orc')).toBe('unknown');
    expect(discoveredCount(s)).toBe(0);
  });

  it('markSeen flips unknown -> seen exactly once and records the floor', () => {
    const s = emptyDiscovery();
    expect(markSeen(s, 'orc', 3)).toBe(true);
    expect(markSeen(s, 'orc', 9)).toBe(false); // already seen
    expect(tierOf(s, 'orc')).toBe('seen');
    expect(s.firstSeenFloor['orc']).toBe(3); // first floor wins
    expect(discoveredCount(s)).toBe(1);
  });

  it('markDefeated implies seen, sets defeated, and counts kills', () => {
    const s = emptyDiscovery();
    markDefeated(s, 'snake', 2);
    markDefeated(s, 'snake', 2);
    expect(tierOf(s, 'snake')).toBe('defeated');
    expect(s.seen['snake']).toBe(true);
    expect(s.killCount['snake']).toBe(2);
    expect(s.firstSeenFloor['snake']).toBe(2);
  });

  it('a prior sighting floor is preserved when later defeated', () => {
    const s = emptyDiscovery();
    markSeen(s, 'yeti', 13);
    markDefeated(s, 'yeti', 15);
    expect(s.firstSeenFloor['yeti']).toBe(13);
  });
});

describe('stat bands', () => {
  it('maps hp into coarse buckets without leaking exact values', () => {
    expect(hpBand(22)).toBe('Frail');
    expect(hpBand(89)).toBe('Sturdy');
    expect(hpBand(1050)).toBe('Monstrous');
  });
  it('maps attack into threat bands', () => {
    expect(atkBand(1)).toBe('Harmless');
    expect(atkBand(13)).toBe('Fierce');
    expect(atkBand(27)).toBe('Deadly');
  });
});

describe('snapshot', () => {
  it('is a deep copy so later mutations do not bleed through', () => {
    const s = emptyDiscovery();
    markSeen(s, 'orc', 1);
    const snap = snapshotDiscovery(s);
    markDefeated(s, 'orc', 1);
    expect(snap.defeated['orc']).toBeUndefined(); // snapshot frozen at seen
    expect(snap.seen['orc']).toBe(true);
  });
});
