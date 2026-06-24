import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildAssetManifest, allAssetEntries } from './assetManifest';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

/*
 * Guard: every art asset the game expects must exist on disk.
 *
 * This is the "keep in sync" enforcement — adding a monster, potion, scroll,
 * wand, gear item, floor, or ending scenario to its registry adds an expected
 * entry here automatically, so this test goes red until the matching image is
 * generated. Run `node scripts/audit-assets.mjs` for the same check with a
 * fuller human-readable gap report and orphan detection.
 */
describe('asset manifest', () => {
  const groups = buildAssetManifest();

  it('enumerates every art category', () => {
    // Sanity floor so a registry/import regression that empties a group is loud.
    expect(groups.length).toBeGreaterThanOrEqual(10);
    for (const group of groups) {
      expect(group.entries.length, `${group.category} has no entries`).toBeGreaterThan(0);
    }
  });

  it('produces unique paths within each directory', () => {
    const seen = new Map<string, string>();
    for (const e of allAssetEntries()) {
      const prior = seen.get(e.path);
      expect(prior, `duplicate asset path ${e.path} (${prior} & ${e.label})`).toBeUndefined();
      seen.set(e.path, e.label);
    }
  });

  for (const group of groups) {
    const required = group.entries.filter(e => !e.optional);
    it(`has every required ${group.category} image on disk`, () => {
      const missing = required
        .filter(e => !existsSync(join(repoRoot, e.path)))
        .map(e => `${e.path} (${e.label})`);
      expect(missing, `missing ${group.category} art — generate via ${group.generator}`).toEqual([]);
    });
  }
});
