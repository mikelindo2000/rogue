# Asset Image Audit

A single command that takes a full **item/scene → image inventory** of the game
and reports any in-game asset that is missing its picture, so gaps can be filled
before they ship as broken art.

```bash
npm run audit:assets          # full inventory + gap report (exit 1 if gaps)
node scripts/audit-assets.mjs # same thing
```

It covers every generated-art category:

| Category | Directory | Source of truth |
| --- | --- | --- |
| Food | `public/inventory/` | `foodArtUrl()` (Rations) |
| Potions | `public/inventory/` | `POTION_TYPES` (`src/itemVisuals.ts`) |
| Scrolls | `public/inventory/` | `SCROLL_TYPES` (`src/itemVisuals.ts`) |
| Wands & Staves | `public/inventory/` | `WAND_POOL` (`src/config.ts`) |
| Weapons & Armor | `public/inventory/` | `GEAR_POOL` (`src/config.ts`) |
| Bestiary portraits | `public/bestiary/` | `MONSTER_DATABASE` (`src/config.ts`) |
| Monster death scenes | `public/endings/` | `MONSTER_DATABASE` × 3 variants |
| End-run scenario scenes | `public/endings/` | `SCENARIOS` × 6 + victory finale (`src/ui/endRunArt.ts`) |
| Floor backgrounds | `public/backgrounds/` | `FLOOR_BACKGROUNDS` (`src/ui/backgrounds.ts`) |
| Legacy background pool | `public/backgrounds/` | `LEGACY_DUNGEON_BACKGROUNDS` (optional) |
| Intro splash | `public/intro/` | singleton in the manifest |

## How it stays in sync

The audit never hardcodes the expected file list. `src/assetManifest.ts` imports
the **same registries the game renders from** and resolves each one to a path via
the **same url helpers the UI uses** (`monsterArtUrl`, `gearArtUrl`,
`potionArtUrl`, `backgroundUrl`, `endRunArtUrl`, …). So when someone adds a
monster to `MONSTER_DATABASE`, a potion to `POTION_TYPES`, a floor to
`FLOOR_BACKGROUNDS`, etc., the expected image appears in the manifest
automatically and the audit immediately reports it as a gap. There is no second
list to keep in sync.

The script loads that TypeScript manifest through Vite's SSR loader
(`vite.ssrLoadModule`), which is why it sees the live registries with zero
duplication and no separate build step.

### Two ways the gap is caught

1. **`npm run audit:assets`** — rich human report: per-category present/expected
   counts, the exact missing filenames with their generator command + recipe
   doc, and any **orphans** (files on disk that no registry claims — usually
   stale art from a rename). Exits non-zero when a required image is missing, so
   it works as a CI/pre-deploy gate.
2. **`src/assetManifest.test.ts`** — part of the normal `npm test` suite. It
   asserts every required image exists on disk, so a registry addition without
   art turns the test red without anyone remembering to run the audit.

## Flags

```bash
node scripts/audit-assets.mjs --missing             # only the gaps
node scripts/audit-assets.mjs --orphans             # only on-disk files with no registry entry
node scripts/audit-assets.mjs --category=monsters   # one category
node scripts/audit-assets.mjs --json                # machine-readable (groups + summary)
```

Categories for `--category=`: `food`, `potions`, `scrolls`, `wands`, `gear`,
`monsters`, `monster-death`, `endings`, `backgrounds`, `legacy-backgrounds`,
`intro`.

## Filling a gap

The report names, per missing file, both the **generator** and the **recipe
doc**. The recipe docs hold the prompt template, model, size, steps, and seeds:

- Inventory items (gear/food, manual) — `design/implemented/inventory_image_generation.md`
- Scrolls — `scripts/gen-scroll-art.sh` (+ that doc)
- Wands & staves — `scripts/gen-wand-art.sh` (+ that doc)
- Bestiary portraits — `design/implemented/monster_image_generation.md`
- Monster death scenes — `node scripts/gen-monster-death-art.mjs` (+ `end_run_image_generation.md`)
- End-run scenario scenes — `design/implemented/end_run_image_generation.md`
- Floor backgrounds — `node scripts/gen-background-art.mjs` (+ `background_image_generation.md`)
- Intro splash — `scripts/gen-intro-art.sh`

All generators write to the slug-stable path the audit expects and are
idempotent (same seed → same image), so re-running only fills what is missing.

## Adding a brand-new art category

If you introduce a new kind of art (a new directory under `public/`):

1. Render it through a stable url helper keyed off a registry (mirror how
   `monsterArtUrl`/`gearArtUrl` work) so there is one source of truth.
2. Add a group for it in `buildAssetManifest()` in `src/assetManifest.ts`,
   pointing `sourceOfTruth`, `designDoc`, and `generator` at the right places.
3. Write the recipe doc and (ideally) a generator script next to the others.

The audit, the guard test, the `--category` filter, and the JSON output all pick
it up from that one group definition.
