import { describe, expect, it } from 'vitest';
import { createFloorBackgroundPicker } from '../ui/backgrounds';
import { chromeOverlaysForFloor } from '../ui/chromeOverlays';
import {
  FLOOR_BACKGROUND_READY_WAIT_MS,
  chromeOverlayTextureUrlsForFloor,
  floorStageImagePlan,
  likelyNeighborFloor,
} from './imageLoadPlans';

describe('floor stage image load plans', () => {
  it('uses the 180 ms readiness cap selected for floor background swaps', () => {
    expect(FLOOR_BACKGROUND_READY_WAIT_MS).toBe(180);
    expect(FLOOR_BACKGROUND_READY_WAIT_MS).toBeLessThan(200);
  });

  it('plans current floor background and chrome overlays as the critical target', () => {
    const plan = floorStageImagePlan({
      floor: 4,
      stairsNearby: false,
      pickBackground: floor => `floor-${String(floor).padStart(2, '0')}-a.png`,
    });

    expect(plan.current).toEqual({
      floor: 4,
      backgroundUrl: '/backgrounds/floor-04-a.png',
      chromeOverlayUrls: chromeOverlayTextureUrlsForFloor(4),
    });
    expect(plan.neighbor).toBeNull();
  });

  it('commits one deterministic neighbor background through the provided run picker', () => {
    const picker = createFloorBackgroundPicker({
      seed: 1,
      next: () => 0.9,
      int: max => max - 1,
      range: (_min, max) => max,
      chance: () => false,
      pick: arr => arr[arr.length - 1],
      getState: () => 1,
    });
    const plan = floorStageImagePlan({
      floor: 7,
      stairsNearby: true,
      pickBackground: floor => picker.pick(floor),
    });

    expect(plan.neighbor?.floor).toBe(8);
    expect(plan.neighbor?.backgroundUrl).toBe('/backgrounds/floor-08-d.png');
    expect(picker.pick(8)).toBe('floor-08-d.png');
  });

  it('predicts ascent after the amulet and does not warm a floor when escape is likely', () => {
    expect(likelyNeighborFloor(9, { hasAmulet: true })).toBe(8);
    expect(likelyNeighborFloor(1, { hasAmulet: true })).toBeNull();
  });

  it('uses the previous floor as the conservative fallback at max depth', () => {
    expect(likelyNeighborFloor(20)).toBe(19);
  });

  it('resolves only concrete chrome texture URLs for the requested floor', () => {
    const urls = chromeOverlayTextureUrlsForFloor(12);

    expect(urls).toHaveLength(chromeOverlaysForFloor(12).length);
    expect(urls.every(url => url.startsWith('/chrome-overlays/'))).toBe(true);
    expect(urls.every(url => url.endsWith('.png'))).toBe(true);
  });
});
