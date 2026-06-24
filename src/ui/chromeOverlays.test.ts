import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  CHROME_OVERLAY_FLOOR_ASSIGNMENTS,
  CHROME_OVERLAY_TEXTURES,
  chromeOverlayTextureByKey,
  chromeOverlayUrl,
  chromeOverlaysForFloor,
} from './chromeOverlays';
import { FLOOR_MAX } from './backgrounds';

const CHROME_OVERLAY_DIR = resolve(process.cwd(), 'public/chrome-overlays');
const REJECTED_IDS = [2, 5, 14, 18, 21, 25, 28, 29, 30, 31, 32, 35];

describe('chrome overlay registry', () => {
  it('keeps only the approved generated textures', () => {
    expect(CHROME_OVERLAY_TEXTURES).toHaveLength(23);
    expect(CHROME_OVERLAY_TEXTURES.map(texture => texture.id)).not.toEqual(
      expect.arrayContaining(REJECTED_IDS),
    );
  });

  it('assigns chrome overlays to every floor', () => {
    expect(CHROME_OVERLAY_FLOOR_ASSIGNMENTS.map(rule => rule.floor)).toEqual(
      Array.from({ length: FLOOR_MAX }, (_, i) => i + 1),
    );
    expect(CHROME_OVERLAY_FLOOR_ASSIGNMENTS.every(rule => rule.layers.length >= 1)).toBe(true);
  });

  it('uses every approved texture in at least one floor assignment', () => {
    const assigned = new Set(
      CHROME_OVERLAY_FLOOR_ASSIGNMENTS.flatMap(rule =>
        rule.layers.map(layer => layer.textureKey),
      ),
    );

    expect([...assigned].sort()).toEqual(
      CHROME_OVERLAY_TEXTURES.map(texture => texture.key).sort(),
    );
  });

  it('resolves floor layers to existing texture registry entries', () => {
    for (const rule of CHROME_OVERLAY_FLOOR_ASSIGNMENTS) {
      for (const layer of rule.layers) {
        const texture = chromeOverlayTextureByKey(layer.textureKey);
        expect(texture, `floor ${rule.floor} missing texture ${layer.textureKey}`).toBeTruthy();
        expect(layer.opacity).toBeGreaterThan(0);
        expect(layer.opacity).toBeLessThanOrEqual(1);
        expect(layer.tileSize).toBeGreaterThan(0);
      }
    }
  });

  it('clamps out-of-range floor lookups', () => {
    expect(chromeOverlaysForFloor(0)).toEqual(chromeOverlaysForFloor(1));
    expect(chromeOverlaysForFloor(99)).toEqual(chromeOverlaysForFloor(20));
    expect(chromeOverlaysForFloor(Number.NaN)).toEqual(chromeOverlaysForFloor(1));
  });

  it('builds public URLs and has files on disk for every approved texture', () => {
    for (const texture of CHROME_OVERLAY_TEXTURES) {
      expect(chromeOverlayUrl(texture.file)).toBe(`/chrome-overlays/${texture.file}`);
      expect(existsSync(resolve(CHROME_OVERLAY_DIR, texture.file))).toBe(true);
    }
  });
});
