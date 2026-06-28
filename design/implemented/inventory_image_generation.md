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

## Scroll line

Generated at **8 steps** for sharper detail and consistent quality with the
wand/staff line. See `scripts/gen-scroll-art.sh`; re-running is idempotent
(same seed -> same image). Scroll of Light predates the script at seed 8500.

| Item | Subject | Seed |
| --- | --- | --- |
| Scroll of Repair | aged rolled parchment scroll tied with cord, silver anvil and mending rune, tiny sparks stitching a cracked shield (accent silver blue) | 8520 |
| Scroll of Magic Mapping | unfurled aged parchment scroll with glowing dungeon corridors and room outlines drawn in blue ink (accent blueprint blue) | 8521 |
| Scroll of Monster Detection | aged parchment scroll with a bright teal eye rune sensing tiny clawed silhouettes through smoky darkness, pulsing psychic rings (accent psychic teal) | 8537 |
| Scroll of Teleportation | aged parchment scroll twisting around a violet portal spiral, edges lifting in impossible wind (accent portal violet) | 8522 |
| Scroll of Hold Monster | aged rolled parchment scroll bound by spectral chains around a clawed shadow silhouette (accent spectral teal) | 8523 |
| Scroll of Sleep | aged parchment scroll with a pale crescent moon rune shedding soft blue sleep mist (accent drowsy periwinkle) | 8524 |
| Scroll of Create Monster | torn aged parchment scroll with a red summoning circle and an emerging clawed silhouette (accent summoning red) | 8525 |
| Scroll of Aggravate Monsters | aged parchment scroll marked with a black horn rune radiating angry orange sound waves (accent alarm orange) | 8526 |
| Scroll of Enchant Weapon | aged parchment scroll with a simple blue sword icon painted on the parchment, plain clean corners, no decorative marks (accent rune blue) | 9000 |
| Scroll of Enchant Armor | aged parchment scroll wrapped around a faintly glowing breastplate rune, hardened green ward lines (accent warding green) | 8528 |
| Scroll of Protect Armor | aged parchment scroll with a shield rune under a golden warding dome (accent golden ward) | 8529 |
| Scroll of Remove Curse | aged parchment scroll with broken black chains dissolving into white sparks (accent cleansing white) | 8530 |
| Scroll of Identify | aged parchment scroll with a bright eye rune and small revealed item silhouettes in lavender light (accent revealing lavender) | 8531 |
| Scroll of Food Detection | aged parchment scroll with warm amber bread and herb runes pulsing outward (accent warm amber) | 8532 |
| Scroll of Gold Detection | aged parchment scroll with coin sigils glowing through dungeon dust (accent coin gold) | 8533 |
| Scroll of Monster Confusion | aged parchment scroll with a crimson hand rune and spiraling disorientation marks (accent dizzy crimson) | 8534 |
| Scroll of Scare Monster | aged parchment scroll with a frightening theatrical mask rune casting long shadows, symbol only, no circular glyphs, no inscriptions or signatures (accent fearful gray) | 8535 |
| Blank Paper | plain aged blank parchment scroll tied with cord, no markings, subdued and mundane (accent muted beige gray) | 8536 |

## Gear weapon-class expansion line

The Phase-0 weapon-class expansion (axes, polearms, bows, blunderbusses, shadow
staff) added 16 `GEAR_POOL` items in `src/config.ts`. Generated at **8 steps**
(matching the wand/scroll lines, sharper than the 2-step gear baseline) by
`scripts/gen-gear-art.sh`, which is idempotent (same seed → same image). Seeds
reserve the 8700+ block. Slugs are `slugify(item.name)`, guarded by
`src/assetManifest.test.ts`.

| Item | Subject | Seed |
| --- | --- | --- |
| Hand Axe | compact one-handed hand axe with a simple bearded iron head and worn wooden haft (accent steel gray) | 8700 |
| Battle Axe | sturdy one-handed battle axe with a broad crescent iron blade and leather-wrapped haft (accent steel gray) | 8701 |
| Reaver | menacing one-handed reaver axe with a jagged blackened blade and cruel hooked spike (accent blood red) | 8702 |
| Greataxe | large two-handed greataxe with a massive double-bitted iron head on a long wooden haft (accent iron gray) | 8703 |
| War Cleaver | brutal two-handed war cleaver with an enormous rectangular chopping blade on a long haft (accent steel gray) | 8704 |
| Executioner | huge two-handed executioner greataxe with a wide grim blackened blade and engraved head (accent dark crimson) | 8705 |
| Spear | long spear with a leaf-shaped polished steel point and slender wooden shaft (accent steel gray) | 8706 |
| Halberd | two-handed halberd with an axe blade, top spike, and rear hook on a long wooden shaft (accent iron gray) | 8707 |
| Glaive of Ruin | legendary glaive of ruin polearm with a long curved blade wreathed in dark violet energy on a tall shaft (accent violet) | 8708 |
| Short Bow | simple curved wooden short bow with a taut bowstring (accent warm brown) | 8709 |
| Long Bow | tall elegant wooden long bow with a taut bowstring (accent rich brown) | 8710 |
| Storm Recurve | enchanted storm recurve bow crackling with arcs of blue lightning along its curved limbs (accent electric blue) | 8711 |
| Hand Cannon | stout one-handed iron hand cannon with a short flared muzzle and wooden grip (accent gunmetal gray) | 8712 |
| Blunderbuss | ornate flintlock blunderbuss firearm with a wide flared brass muzzle and carved walnut stock (accent brass and walnut) | 8713 |
| Thunder Cannon | massive legendary thunder cannon firearm with a huge flared barrel wreathed in smoke and golden sparks (accent molten gold) | 8714 |
| Shadow Staff | wooden wizard staff tipped with a swirling dark shadow crystal leaking violet-black smoke (accent shadow violet) | 8715 |

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
