/* Asset manifest — the single source of truth for "what image assets the game
 * expects to exist on disk".
 *
 * Every generated art category (inventory items, bestiary portraits, floor
 * backgrounds, end-run / death scenes, the intro splash) is enumerated here by
 * importing the SAME registries the game renders from, then resolving each entry
 * to its `public/...` path via the SAME url helpers the UI uses. That coupling
 * is the whole point: a new monster, potion, scroll, wand, gear item, floor, or
 * ending scenario added to its registry automatically shows up here, so the
 * audit script (`scripts/audit-assets.mjs`) and the guard test
 * (`src/assetManifest.test.ts`) flag the missing image without any change to
 * this file.
 *
 * If you add a brand-new CATEGORY of art (a new directory under public/), add a
 * group for it below and point `designDoc` / `generator` at its recipe so future
 * agents know how to fill the gap. See design/implemented/asset_image_audit.md.
 */
import { GEAR_POOL, WAND_POOL, MONSTER_DATABASE } from './config';
import { POTION_TYPES, SCROLL_TYPES } from './itemVisuals';
import { monsterArtUrl } from './ui/monsterArt';
import {
  foodArtUrl,
  potionArtUrl,
  scrollArtUrl,
  wandArtUrl,
  gearArtUrl,
} from './ui/inventoryArt';
import { FLOOR_BACKGROUNDS, LEGACY_DUNGEON_BACKGROUNDS, backgroundUrl } from './ui/backgrounds';
import {
  END_RUN_ART_FILES,
  MONSTER_DEATH_ART_FILES,
  VICTORY_FINALE_ART_FILE,
  endRunArtUrl,
} from './ui/endRunArt';

/** One expected image file, resolved from a registry entry. */
export interface AssetEntry {
  /** Human-readable label for the thing the image depicts. */
  label: string;
  /** Directory under `public/`, e.g. `inventory`. */
  dir: string;
  /** Bare filename, e.g. `potion-of-healing.png`. */
  file: string;
  /** Path relative to repo root, e.g. `public/inventory/potion-of-healing.png`. */
  path: string;
  /** Web path the game loads it from, e.g. `/inventory/potion-of-healing.png`. */
  url: string;
  /**
   * Legacy/optional art that is intentionally retained but not strictly
   * required for a complete game. Missing optional assets are reported but do
   * NOT fail the audit / guard test.
   */
  optional?: boolean;
}

/** A category of art sharing one source-of-truth registry and one recipe. */
export interface AssetGroup {
  /** Stable key for `--category=` filtering, e.g. `potions`. */
  category: string;
  /** Display title. */
  title: string;
  /** Directory under `public/`. */
  dir: string;
  /** Where the expected entries come from (module + export). */
  sourceOfTruth: string;
  /** Design doc describing the prompt/recipe for this category. */
  designDoc: string;
  /** Command/script that (re)generates missing files, if any. */
  generator: string;
  entries: AssetEntry[];
}

/** Split a UI url like `/inventory/foo.png` into {dir, file, path}. */
function fromUrl(url: string): { dir: string; file: string; path: string } {
  const clean = url.replace(/^\//, '');
  const slash = clean.indexOf('/');
  const dir = clean.slice(0, slash);
  const file = clean.slice(slash + 1);
  return { dir, file, path: `public/${clean}` };
}

function entry(label: string, url: string, optional = false): AssetEntry {
  const { dir, file, path } = fromUrl(url);
  return { label, dir, file, path, url, ...(optional ? { optional } : {}) };
}

/** Build the full manifest fresh from the live registries. */
export function buildAssetManifest(): AssetGroup[] {
  const inventoryDoc = 'design/implemented/inventory_image_generation.md';

  const foodEntries: AssetEntry[] = [entry('Rations', foodArtUrl())];

  const potionEntries: AssetEntry[] = POTION_TYPES.map(type =>
    entry(`Potion of ${type}`, potionArtUrl(type)),
  );

  const scrollEntries: AssetEntry[] = SCROLL_TYPES.map(type =>
    entry(`Scroll of ${type}`, scrollArtUrl(type)),
  );

  const wandEntries: AssetEntry[] = WAND_POOL.map(wand =>
    entry(wand.name, wandArtUrl(wand)),
  );

  const gearEntries: AssetEntry[] = Object.entries(GEAR_POOL).flatMap(([slot, items]) =>
    items.map(item => entry(`${item.name} (${slot})`, gearArtUrl(item))),
  );

  const monsterEntries: AssetEntry[] = MONSTER_DATABASE.map(monster =>
    entry(monster.name, monsterArtUrl(monster)),
  );

  const floorBgEntries: AssetEntry[] = FLOOR_BACKGROUNDS.map(name =>
    entry(name.replace('.png', ''), backgroundUrl(name)),
  );

  const legacyBgEntries: AssetEntry[] = LEGACY_DUNGEON_BACKGROUNDS.map(name =>
    entry(name.replace('.png', ''), backgroundUrl(name), /* optional */ true),
  );

  const scenarioEndingEntries: AssetEntry[] = END_RUN_ART_FILES.map(file =>
    entry(file.replace('.png', ''), endRunArtUrl(file)),
  );

  const finaleEntry: AssetEntry = entry(
    VICTORY_FINALE_ART_FILE.replace('.png', ''),
    endRunArtUrl(VICTORY_FINALE_ART_FILE),
  );

  const monsterDeathEntries: AssetEntry[] = MONSTER_DEATH_ART_FILES.map(file =>
    entry(file.replace('.png', ''), endRunArtUrl(file)),
  );

  return [
    {
      category: 'food',
      title: 'Food',
      dir: 'inventory',
      sourceOfTruth: "src/ui/inventoryArt.ts foodArtUrl()",
      designDoc: inventoryDoc,
      generator: 'mflux-generate-flux2 (manual, see doc)',
      entries: foodEntries,
    },
    {
      category: 'potions',
      title: 'Potions',
      dir: 'inventory',
      sourceOfTruth: 'src/itemVisuals.ts POTION_TYPES',
      designDoc: inventoryDoc,
      generator: 'mflux-generate-flux2 (manual, see doc)',
      entries: potionEntries,
    },
    {
      category: 'scrolls',
      title: 'Scrolls',
      dir: 'inventory',
      sourceOfTruth: 'src/itemVisuals.ts SCROLL_TYPES',
      designDoc: inventoryDoc,
      generator: 'scripts/gen-scroll-art.sh',
      entries: scrollEntries,
    },
    {
      category: 'wands',
      title: 'Wands & Staves',
      dir: 'inventory',
      sourceOfTruth: 'src/config.ts WAND_POOL',
      designDoc: inventoryDoc,
      generator: 'scripts/gen-wand-art.sh',
      entries: wandEntries,
    },
    {
      category: 'gear',
      title: 'Weapons & Armor',
      dir: 'inventory',
      sourceOfTruth: 'src/config.ts GEAR_POOL',
      designDoc: inventoryDoc,
      generator: 'mflux-generate-flux2 (manual, see doc)',
      entries: gearEntries,
    },
    {
      category: 'monsters',
      title: 'Bestiary Portraits',
      dir: 'bestiary',
      sourceOfTruth: 'src/config.ts MONSTER_DATABASE',
      designDoc: 'design/implemented/monster_image_generation.md',
      generator: 'mflux-generate-flux2 (manual, see doc)',
      entries: monsterEntries,
    },
    {
      category: 'monster-death',
      title: 'Monster Death Scenes',
      dir: 'endings',
      sourceOfTruth: 'src/config.ts MONSTER_DATABASE × 3 variants (src/ui/endRunArt.ts)',
      designDoc: 'design/implemented/end_run_image_generation.md',
      generator: 'node scripts/gen-monster-death-art.mjs',
      entries: monsterDeathEntries,
    },
    {
      category: 'endings',
      title: 'End-Run Scenario Scenes',
      dir: 'endings',
      sourceOfTruth: 'src/ui/endRunArt.ts SCENARIOS × 6 + victory finale',
      designDoc: 'design/implemented/end_run_image_generation.md',
      generator: 'mflux-generate-flux2 (manual, see doc)',
      entries: [...scenarioEndingEntries, finaleEntry],
    },
    {
      category: 'backgrounds',
      title: 'Floor Backgrounds',
      dir: 'backgrounds',
      sourceOfTruth: 'src/ui/backgrounds.ts FLOOR_BACKGROUNDS',
      designDoc: 'design/implemented/background_image_generation.md',
      generator: 'node scripts/gen-background-art.mjs',
      entries: floorBgEntries,
    },
    {
      category: 'legacy-backgrounds',
      title: 'Legacy Background Pool (optional)',
      dir: 'backgrounds',
      sourceOfTruth: 'src/ui/backgrounds.ts LEGACY_DUNGEON_BACKGROUNDS',
      designDoc: 'design/implemented/background_image_generation.md',
      generator: '(retained legacy art — not actively generated)',
      entries: legacyBgEntries,
    },
    {
      category: 'intro',
      title: 'Intro Splash',
      dir: 'intro',
      sourceOfTruth: 'src/assetManifest.ts (singleton)',
      designDoc: 'design/implemented/intro_narration_prompt.md',
      generator: 'scripts/gen-intro-art.sh',
      entries: [entry('Intro background', '/intro/intro-bg.png')],
    },
  ];
}

/** Flat list of every expected entry across all groups. */
export function allAssetEntries(): AssetEntry[] {
  return buildAssetManifest().flatMap(group => group.entries);
}
