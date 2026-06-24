# Chrome Overlay Textures

The game chrome uses floor-specific material textures behind the top bar and
side rails. They are decorative only: text, focus rings, and gameplay feedback
must remain readable without them.

## Runtime Architecture

- Registry: `src/ui/chromeOverlays.ts`
- Renderer: `src/ui/visualEffects.ts` emits `floor-chrome-texture` effects for
  the `chrome` target.
- Host: `src/ui/components/EffectLayerHost.svelte` renders keyed layers with a
  short fade, so changing floors crossfades textures instead of snapping.
- CSS recipe: `src/ui/styles/effects.css` repeats the texture at low opacity
  with `soft-light` blending.
- Asset inventory: `src/assetManifest.ts` includes `chrome-overlays`, so
  `npm run audit:assets` reports missing or orphaned texture files.
- Preview/generator: `scripts/gen-chrome-overlay-textures.mjs` renders
  `public/chrome-overlays/index.html`, a chooser page with an opacity slider.

## Generation Recipe

- Generator: local `mflux-generate-flux2`
- Model: `Runpod/FLUX.2-klein-4B-mflux-4bit`
- Base model: `flux2-klein-4b`
- Scheduler: `linear`
- Size: `512x512`
- Steps: `8`
- Format: PNG

Regenerate missing approved textures:

```bash
node scripts/gen-chrome-overlay-textures.mjs
```

Regenerate the chooser page only:

```bash
node scripts/gen-chrome-overlay-textures.mjs --page-only
```

## Approved Batch

Rejected generated images were deleted because the prompts were acceptable but
the local model produced artifacts in those outputs: `2`, `5`, `14`, `18`,
`21`, `25`, `28`, `29`, `30`, `31`, `32`, and `35`.

The approved files are:

| Id | Texture | File |
| --- | --- | --- |
| 1 | Old Ashlar | `texture-01-old-ashlar.png` |
| 3 | Black Basalt | `texture-03-black-basalt.png` |
| 4 | Granite Rubble | `texture-04-granite-rubble.png` |
| 6 | Sandstone Crypt | `texture-06-sandstone-crypt.png` |
| 7 | Salt Crust | `texture-07-salt-crust.png` |
| 8 | Moss Mortar | `texture-08-moss-mortar.png` |
| 9 | Root Veined Rock | `texture-09-root-veined-rock.png` |
| 10 | Lichen Bricks | `texture-10-lichen-bricks.png` |
| 11 | Fungal Stone | `texture-11-fungal-stone.png` |
| 12 | Ivy Shadow | `texture-12-ivy-shadow.png` |
| 13 | Clay Cave | `texture-13-clay-cave.png` |
| 15 | Shale Strata | `texture-15-shale-strata.png` |
| 16 | Lava Cooled | `texture-16-lava-cooled.png` |
| 17 | Crystal Dust | `texture-17-crystal-dust.png` |
| 19 | Iron Banded | `texture-19-iron-banded.png` |
| 20 | Verdigris Copper | `texture-20-verdigris-copper.png` |
| 22 | Chainmail Shadow | `texture-22-chainmail-shadow.png` |
| 23 | Rust Patina | `texture-23-rust-patina.png` |
| 24 | Charred Plank | `texture-24-charred-plank.png` |
| 26 | Root Wattle | `texture-26-root-wattle.png` |
| 27 | Coffin Wood | `texture-27-coffin-wood.png` |
| 33 | Ice Rimed Brick | `texture-33-ice-rimed-brick.png` |
| 34 | Ember Mortar | `texture-34-ember-mortar.png` |

## Floor Assignment

Each floor has one primary texture. Three extra approved textures are faint
secondary layers on floors where they fit the room band.

| Floor | Primary | Secondary |
| --- | --- | --- |
| 1 | Old Ashlar |  |
| 2 | Granite Rubble |  |
| 3 | Salt Crust |  |
| 4 | Moss Mortar | Root Wattle |
| 5 | Sandstone Crypt | Coffin Wood |
| 6 | Root Veined Rock |  |
| 7 | Lichen Bricks |  |
| 8 | Fungal Stone |  |
| 9 | Clay Cave |  |
| 10 | Shale Strata |  |
| 11 | Crystal Dust |  |
| 12 | Ivy Shadow | Ice Rimed Brick |
| 13 | Verdigris Copper |  |
| 14 | Chainmail Shadow |  |
| 15 | Black Basalt |  |
| 16 | Rust Patina |  |
| 17 | Charred Plank |  |
| 18 | Iron Banded |  |
| 19 | Lava Cooled |  |
| 20 | Ember Mortar |  |

## Verification

Any future change should include:

- `npm run test:run -- src/ui/chromeOverlays.test.ts src/ui/visualEffects.test.ts src/assetManifest.test.ts`
- `npm run audit:assets`
- Browser proof of at least floor 1 and one deeper floor, checking that chrome
  text remains legible and the texture fades on floor change.
