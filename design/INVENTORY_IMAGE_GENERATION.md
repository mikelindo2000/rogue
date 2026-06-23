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
