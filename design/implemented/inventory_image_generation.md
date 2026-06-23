# Inventory Image Generation

Inventory art in `public/inventory/` is generated raster art. Keep output paths
matched to the stable slug used by `inventoryArtUrl()`:

```text
public/inventory/<item-name-slug>.png
```

Small line icons and color metadata are separate from these 512px art assets.
Shared potion visuals live in `src/itemVisuals.ts`; paired bottle icons live in
the grouped potion registry in `src/ui/icons.ts`. When adding a new potion,
update `PotionType`, add its `POTION_VISUALS` entry, add the paired icon path,
generate the matching `public/inventory/potion-of-<type>.png`, and add/extend
tests so floor glyphs, inventory cells, popover rows, and modal details all use
the same visual identity.

## Current Recipe

- Model: `Runpod/FLUX.2-klein-4B-mflux-4bit`
- Base model: `flux2-klein-4b`
- Size: `512x512`
- Steps: `2`
- Seeds: start at `8400` and increment by item order below
- Format: PNG

For direct mflux usage, the shape is:

```bash
mflux-generate-flux2 \
  --model Runpod/FLUX.2-klein-4B-mflux-4bit \
  --base-model flux2-klein-4b \
  --steps 2 \
  --width 512 \
  --height 512 \
  --seed 8400 \
  --prompt "$PROMPT" \
  --output public/inventory/rations.png
```

## Prompt Template

```text
single centered dark fantasy roguelike inventory item illustration, SUBJECT, accent color COLOR, readable silhouette at small UI size, smoky charcoal dungeon background, subtle vignette, dramatic rim lighting, painterly concept art, high contrast, crisp edges, atmospheric but not blurry, no text, no letters, no logo, no border, no UI, no frame
```

Use the item rarity or material as the accent color when one is obvious. Common
staples should stay muted; magical or legendary gear can lean into stronger
glow.

## Subject Hints

| Item | Subject |
| --- | --- |
| Rations | wrapped travel rations, dried meat, hard bread, and herbs tied with cord |
| Potion of Healing | round glass potion vial filled with luminous red liquid |
| Potion of Strength | squat glass potion vial filled with molten amber liquid |
| Potion of Invisibility | clear glass potion vial with faint silver-blue shimmer |
| Potion of Armor | sturdy glass potion vial with glowing steel-blue liquid |
| Leather Cap | worn leather cap with stitched seams |
| Iron Helm | iron dungeon helmet with cheek guards |
| Dragon Visor | scaled draconic visor with ember-lit eye slit |
| Cloth Shirt | folded rough cloth shirt with simple lacing |
| Chainmail | heavy chainmail shirt catching cold rim light |
| Platemail | polished plate cuirass with dents and scratches |
| Leather Pants | rugged leather trousers with patched knees |
| Iron Greaves | paired iron greaves and knee guards |
| Dragon Legs | scaled draconic leg armor with ember accents |
| Cloth Gloves | pair of simple cloth gloves |
| Iron Gauntlets | pair of iron gauntlets with worn knuckles |
| Mithril Fists | bright mithril gauntlets with arcane shine |
| Leather Shoes | pair of worn leather shoes |
| Steel Sabatons | pair of steel sabatons with sharp toes |
| Winged Boots | enchanted boots with small pale wings |
| Buckler | small round buckler with scuffed metal boss |
| Kite Shield | tall kite shield with battered painted face |
| Tower Shield | massive rectangular tower shield with reinforced bands |
| Steel Dagger | narrow steel dagger with plain grip |
| Assassin Dirk | dark assassin dirk with blackened blade |
| Void Blade | shadowy dagger with violet void glow |
| Shortsword | compact one-handed sword |
| Broadsword | broad one-handed sword with simple crossguard |
| Rune Blade | sword etched with glowing runes |
| Claymore | large two-handed claymore sword |
| Zweihander | long two-handed sword with swept guard |
| Dragon Slayer | massive dragon-slaying greatsword with scorched edge |
| Club | crude wooden club wrapped in leather |
| Morningstar | spiked morningstar mace with chain and handle |
| Meteor Hammer | heavy mace head glowing like a fallen meteor |
| Warhammer | two-handed warhammer with worn steel head |
| Earth Breaker | stone-cracking warhammer with seismic glow |
| Titan Maul | enormous legendary maul with golden titan inlays |
| Fire Staff | wooden staff tipped with a small fire crystal |
| Frost Staff | wooden staff tipped with an icy blue crystal |
| Arcane Staff | wooden staff tipped with a violet arcane crystal |
| Scroll of Light | aged rolled parchment scroll tied with cord, a glowing golden sun rune blazing on its face radiating warm light (accent warm gold; seed 8500) |
| Wand of Light | slender polished wooden wand tipped with a radiant glowing crystal orb casting warm light (accent pale gold; seed 8501) |

## Wand / Staff line

Generated at **8 steps** (not the 2-step baseline) for sharper, richer art — see
`scripts/gen-wand-art.sh`, which is idempotent (same seed → same image). Seeds
continue from Wand of Light (8501). Wand of Striking (8502) was generated during
validation; the rest by the script.

| Item | Subject | Seed |
| --- | --- | --- |
| Wand of Striking | slender dark hardwood wand with a blunt iron-banded tip crackling with raw kinetic force (accent steel gray) | 8502 |
| Wand of Magic Missile | polished silver wand tipped with a faceted glowing arcane dart of pure focused energy (accent arcane blue) | 8503 |
| Wand of Cold | pale frost-rimed wand tipped with a jagged blue ice crystal trailing cold mist (accent icy blue) | 8504 |
| Wand of Fire | charred blackwood wand tipped with a burning ember crystal wreathed in small flames (accent molten orange) | 8505 |
| Staff of Lightning | tall iron-shod wizard staff crowned with a forked crystal arcing with white-blue lightning (accent electric blue) | 8506 |
| Wand of Sleep | smooth lavender wand tipped with a softly pulsing dream-purple orb releasing drowsy mist (accent dusky violet) | 8507 |
| Wand of Polymorph | twisted iridescent wand tipped with a shifting opal that swirls with mutating color (accent iridescent green and purple) | 8508 |
| Wand of Teleportation | sleek dark wand tipped with a swirling violet portal gem bending space around it (accent deep violet) | 8509 |
| Wand of Cancellation | matte gray null-metal wand tipped with a dull leaden orb that seems to drink the surrounding light (accent muted gray) | 8510 |
| Staff of Drain Life | gnarled bone-white wizard staff crowned with a pulsing crimson heart-crystal siphoning thin red wisps (accent blood crimson) | 8511 |
| Wand of Invisibility | translucent glass wand tipped with a shimmering near-invisible crystal that bends light around it (accent silver-blue shimmer) | 8512 |
| Wand of Nothing | plain unremarkable gray wooden wand with a dull rounded tip, utterly mundane and powerless (accent dull gray) | 8513 |
