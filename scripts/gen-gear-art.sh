#!/usr/bin/env bash
# Generate painted inventory art for the Phase-0 weapon-class expansion gear.
# Mirrors design/implemented/inventory_image_generation.md and the wand/scroll
# generators: deterministic mflux flux2-klein outputs at public/inventory/<slug>.png.
#
# Output: public/inventory/<slug>.png at 512x512, 8 steps (matches the wand/scroll
# lines, sharper than the 2-step baseline). Re-running is idempotent (same seed ->
# same image). Slugs MUST match slugify(item.name) for the GEAR_POOL entries in
# src/config.ts so src/assetManifest.ts resolves them.
#
# Seeds: new gear reserves the 8700+ block (gear baseline used 8400+, wands
# 8500-8513, scrolls 8520-8537/9000).
set -euo pipefail

cd "$(dirname "$0")/.."

MODEL="Runpod/FLUX.2-klein-4B-mflux-4bit"
BASE="flux2-klein-4b"
STEPS=8
PRE="single centered dark fantasy roguelike inventory item illustration, "
POST=", readable silhouette at small UI size, smoky charcoal dungeon background, subtle vignette, dramatic rim lighting, painterly concept art, high contrast, crisp edges, atmospheric but not blurry, no text, no letters, no logo, no border, no UI, no frame"

gen() {
  local seed="$1" slug="$2" subject="$3"
  local out="public/inventory/${slug}.png"
  echo ">>> [$seed] $slug"
  rm -f "$out"
  mflux-generate-flux2 --model "$MODEL" --base-model "$BASE" \
    --steps "$STEPS" --width 512 --height 512 --seed "$seed" \
    --prompt "${PRE}${subject}${POST}" --output "$out" >/dev/null 2>&1
}

# 1h_axe
gen 8700 hand-axe       "compact one-handed hand axe with a simple bearded iron head and worn wooden haft, accent color steel gray"
gen 8701 battle-axe     "sturdy one-handed battle axe with a broad crescent iron blade and leather-wrapped haft, accent color steel gray"
gen 8702 reaver         "menacing one-handed reaver axe with a jagged blackened blade and cruel hooked spike, accent color blood red"
# 2h_axe
gen 8703 greataxe       "large two-handed greataxe with a massive double-bitted iron head on a long wooden haft, accent color iron gray"
gen 8704 war-cleaver    "brutal two-handed war cleaver with an enormous rectangular chopping blade on a long haft, accent color steel gray"
gen 8705 executioner    "huge two-handed executioner greataxe with a wide grim blackened blade and engraved head, accent color dark crimson"
# polearm
gen 8706 spear          "long spear with a leaf-shaped polished steel point and slender wooden shaft, accent color steel gray"
gen 8707 halberd        "two-handed halberd with an axe blade, top spike, and rear hook on a long wooden shaft, accent color iron gray"
gen 8708 glaive-of-ruin "legendary glaive of ruin polearm with a long curved blade wreathed in dark violet energy on a tall shaft, accent color violet"
# bow
gen 8709 short-bow      "simple curved wooden short bow with a taut bowstring, accent color warm brown"
gen 8710 long-bow       "tall elegant wooden long bow with a taut bowstring, accent color rich brown"
gen 8711 storm-recurve  "enchanted storm recurve bow crackling with arcs of blue lightning along its curved limbs, accent color electric blue"
# blunderbuss
gen 8712 hand-cannon    "stout one-handed iron hand cannon with a short flared muzzle and wooden grip, accent color gunmetal gray"
gen 8713 blunderbuss    "ornate flintlock blunderbuss firearm with a wide flared brass muzzle and carved walnut stock, accent color brass and walnut"
gen 8714 thunder-cannon "massive legendary thunder cannon firearm with a huge flared barrel wreathed in smoke and golden sparks, accent color molten gold"
# staff (shadow magic — matches the fire/frost/arcane staff trio)
gen 8715 shadow-staff   "wooden wizard staff tipped with a swirling dark shadow crystal leaking violet-black smoke, accent color shadow violet"

echo ">>> done"
