# Background Image Generation

Dungeon backgrounds live in `public/backgrounds/`. The active stage art is the
floor-themed set:

```text
public/backgrounds/floor-<01-20>-<a-d>.png
```

Each floor has four deterministic variants. `src/ui/backgrounds.ts` maps the
active floor to that floor's four variants, then chooses one at random for
variety while preserving the run's visual progression.

The original `bg_1.png` through `bg_30.png` files are intentionally retained in
`public/backgrounds/` as a legacy reusable pool. They are no longer the active
stage picker source, but they are available if a future screen needs generic
dungeon background art.

## Current Recipe

- Generator: local `mflux-generate-flux2`
- Model: `Runpod/FLUX.2-klein-4B-mflux-4bit`
- Base model: `flux2-klein-4b`
- Size: `512x512`
- Steps: `8`
- Seeds: `10000 + floor * 10 + variantIndex`, where `a=0`, `b=1`, `c=2`, `d=3`
- Format: PNG

Regenerate all missing images:

```bash
node scripts/gen-background-art.mjs
```

Regenerate one floor:

```bash
node scripts/gen-background-art.mjs --floor=12 --force
```

Preview the exact full prompts without generating:

```bash
node scripts/gen-background-art.mjs --dry-run
```

## Prompt System

The canonical prompt catalogue is in `scripts/gen-background-art.mjs`. It
contains exactly four subject prompts for each of the 20 floors. The full prompt
is built from this shared prefix, the floor/variant subject, and the shared
suffix:

```text
dark fantasy roguelike dungeon background illustration, wide environmental scene, designed to sit behind a tile-based dungeon board, no central hero, no foreground character, SUBJECT, cinematic composition, painterly concept art, deep shadows, strong vignette, clear readable silhouettes, atmospheric depth, high contrast, no text, no letters, no logo, no UI, no frame
```

## Progression

| Floors | Band | Direction |
| --- | --- | --- |
| 1-5 | Amber entry dungeon | Torchlit, readable, dangerous but still grounded. |
| 6-10 | Verdigris ruins | Toxic growth, water, mines, fungus, and charnel spaces. |
| 11-15 | Violet vaults | Uncanny magic, mirrors, storm crypts, astral spaces, ritual pressure. |
| 16-20 | Dragon depths | Fire, lava, war, ash, and the final Amulet chamber. |

## Floor Themes

| Floor | Theme | Intensity | Variants |
| --- | --- | --- | --- |
| 1 | Ember Gate | quiet threshold | entrance hall, first corridor, guard vestibule, cellar landing |
| 2 | Collapsed Barracks | watchful ruin | barracks, training room, mess hall, watch room |
| 3 | Moss-Lit Cistern | damp unease | cistern, aqueduct chamber, waterlogged vault, flooded landing |
| 4 | Raider Warrens | crowded menace | den, low tunnels, looted supply chamber, palisade crossing |
| 5 | Forgotten Chapel | haunted stillness | chapel, burial shrine, rooted nave, reliquary |
| 6 | Verdigris Garden | poisoned growth | toxic garden, courtyard chamber, ruined greenhouse, moss gallery |
| 7 | Sunken Archive | arcane pressure | flooded archive, sinking library, drowned study, manuscript vault |
| 8 | Crystal Mines | razor shimmer | mine, cavern worksite, excavation tunnel, quarry chamber |
| 9 | Fungal Furnace | sickly heat | furnace, engine room, mushroom forge, humid fungus tunnel |
| 10 | Bone Market | grim spectacle | market, trading hall, bazaar arcade, auction pit |
| 11 | Violet Vaults | uncanny magic | magic vault, treasure antechamber, arcane safe corridor, strongroom |
| 12 | Mirror Labyrinth | fractured dread | mirror chamber, black glass hall, mirrored crossing, reflective maze |
| 13 | Storm Crypts | restless violence | charged crypt, burial hall, ossuary, tomb crossing |
| 14 | Astral Prison | cosmic strain | prison block, cosmic bridge, jailer hall, prison rotunda |
| 15 | Black Altar | ritual danger | altar chamber, sacrificial hall, ritual nave, obsidian sanctum |
| 16 | Dragon Depths | scorched peril | scorched hall, lava-warmed room, burned treasure passage, descent chamber |
| 17 | Lava Aqueduct | molten urgency | aqueduct crossing, volcanic cistern, molten canal, lava bridge |
| 18 | Obsidian Armory | war at the door | armory, war forge, weapon vault, siege arsenal |
| 19 | Ashen Throne Approach | near-finale dread | throne approach, final antechamber, processional hall, royal landing |
| 20 | Amulet Heart | final boss chamber | dungeon heart, boss arena, treasure sanctum, escape-or-die chamber |
