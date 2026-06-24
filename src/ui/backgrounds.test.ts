import { describe, expect, it } from 'vitest';
import { makeRng } from '../rng';
import {
  FLOOR_BACKGROUNDS,
  FLOOR_BACKGROUND_THEMES,
  FLOOR_BACKGROUND_VARIANTS,
  FLOOR_MAX,
  LEGACY_DUNGEON_BACKGROUNDS,
  backgroundUrl,
  floorBackgrounds,
  pickFloorBackground,
} from './backgrounds';

describe('backgrounds', () => {
  it('lists four themed backgrounds for each floor', () => {
    expect(FLOOR_BACKGROUND_THEMES.length).toBe(FLOOR_MAX);
    expect(FLOOR_BACKGROUND_VARIANTS).toEqual(['a', 'b', 'c', 'd']);
    expect(FLOOR_BACKGROUNDS.length).toBe(80);
    expect(FLOOR_BACKGROUNDS[0]).toBe('floor-01-a.png');
    expect(FLOOR_BACKGROUNDS[79]).toBe('floor-20-d.png');
  });

  it('keeps the old random pool available for other uses', () => {
    expect(LEGACY_DUNGEON_BACKGROUNDS.length).toBe(30);
    expect(LEGACY_DUNGEON_BACKGROUNDS[0]).toBe('bg_1.png');
    expect(LEGACY_DUNGEON_BACKGROUNDS[29]).toBe('bg_30.png');
  });

  it('returns correct background URL', () => {
    expect(backgroundUrl('floor-01-a.png')).toBe('/backgrounds/floor-01-a.png');
    expect(backgroundUrl('floor-20-d.png')).toBe('/backgrounds/floor-20-d.png');
  });

  it('returns only variants for the requested floor', () => {
    expect(floorBackgrounds(1)).toEqual([
      'floor-01-a.png',
      'floor-01-b.png',
      'floor-01-c.png',
      'floor-01-d.png',
    ]);
    expect(floorBackgrounds(20)).toEqual([
      'floor-20-a.png',
      'floor-20-b.png',
      'floor-20-c.png',
      'floor-20-d.png',
    ]);
  });

  it('clamps invalid floor requests to supported themes', () => {
    expect(floorBackgrounds(0)).toEqual(floorBackgrounds(1));
    expect(floorBackgrounds(99)).toEqual(floorBackgrounds(20));
    expect(floorBackgrounds(Number.NaN)).toEqual(floorBackgrounds(1));
  });

  it('picks a background randomly from the requested floor', () => {
    const bg = pickFloorBackground(11);
    expect(floorBackgrounds(11)).toContain(bg);
  });

  it('picks deterministically with an RNG', () => {
    const rng1 = makeRng(42);
    const rng2 = makeRng(42);
    const rng3 = makeRng(999);

    const bg1 = pickFloorBackground(7, rng1);
    const bg2 = pickFloorBackground(7, rng2);
    const bg3 = pickFloorBackground(7, rng3);

    expect(floorBackgrounds(7)).toContain(bg1);
    expect(bg1).toBe(bg2); // same seed -> same selection
    expect(bg1).not.toBe(bg3); // different seed -> different selection (probabilistically, but holds for these seeds)
  });
});
