import { describe, expect, it } from 'vitest';
import { makeRng } from '../rng';
import { DUNGEON_BACKGROUNDS, backgroundUrl, pickRandomBg } from './backgrounds';

describe('backgrounds', () => {
  it('should list 30 backgrounds', () => {
    expect(DUNGEON_BACKGROUNDS.length).toBe(30);
    expect(DUNGEON_BACKGROUNDS[0]).toBe('bg_1.png');
    expect(DUNGEON_BACKGROUNDS[29]).toBe('bg_30.png');
  });

  it('should return correct background URL', () => {
    expect(backgroundUrl('bg_1.png')).toBe('/backgrounds/bg_1.png');
    expect(backgroundUrl('bg_30.png')).toBe('/backgrounds/bg_30.png');
  });

  it('should pick a background randomly', () => {
    const bg = pickRandomBg();
    expect(DUNGEON_BACKGROUNDS).toContain(bg);
  });

  it('should pick deterministically with an RNG', () => {
    const rng1 = makeRng(42);
    const rng2 = makeRng(42);
    const rng3 = makeRng(999);

    const bg1 = pickRandomBg(rng1);
    const bg2 = pickRandomBg(rng2);
    const bg3 = pickRandomBg(rng3);

    expect(DUNGEON_BACKGROUNDS).toContain(bg1);
    expect(bg1).toBe(bg2); // same seed -> same selection
    expect(bg1).not.toBe(bg3); // different seed -> different selection (probabilistically, but holds for these seeds)
  });
});
