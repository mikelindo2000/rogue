#!/usr/bin/env bash
# Generate painted inventory art for the wand/staff line.
# Mirrors design/implemented/inventory_image_generation.md, but at higher quality
# (8 steps instead of the baseline 2) per the "no expense on icon quality" ask.
#
# Output: public/inventory/<slug>.png at 512x512.
# Seeds continue from the inventory guide: Wand of Light = 8501, so wands here
# start at 8502. Re-running is idempotent (same seed -> same image).
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
  mflux-generate-flux2 --model "$MODEL" --base-model "$BASE" \
    --steps "$STEPS" --width 512 --height 512 --seed "$seed" \
    --prompt "${PRE}${subject}${POST}" --output "$out" >/dev/null 2>&1
}

# seed 8502 (wand-of-striking) generated separately during validation.
gen 8503 wand-of-magic-missile "polished silver wand tipped with a faceted glowing arcane dart of pure focused energy, accent color arcane blue"
gen 8504 wand-of-cold          "pale frost-rimed wand tipped with a jagged blue ice crystal trailing cold mist, accent color icy blue"
gen 8505 wand-of-fire          "charred blackwood wand tipped with a burning ember crystal wreathed in small flames, accent color molten orange"
gen 8506 staff-of-lightning    "tall iron-shod wizard staff crowned with a forked crystal arcing with white-blue lightning, accent color electric blue"
gen 8507 wand-of-sleep         "smooth lavender wand tipped with a softly pulsing dream-purple orb releasing drowsy mist, accent color dusky violet"
gen 8508 wand-of-polymorph     "twisted iridescent wand tipped with a shifting opal that swirls with mutating color, accent color iridescent green and purple"
gen 8509 wand-of-teleportation "sleek dark wand tipped with a swirling violet portal gem bending space around it, accent color deep violet"
gen 8510 wand-of-cancellation  "matte gray null-metal wand tipped with a dull leaden orb that seems to drink the surrounding light, accent color muted gray"
gen 8511 staff-of-drain-life   "gnarled bone-white wizard staff crowned with a pulsing crimson heart-crystal siphoning thin red wisps, accent color blood crimson"
gen 8512 wand-of-invisibility  "translucent glass wand tipped with a shimmering near-invisible crystal that bends light around it, accent color silver-blue shimmer"
gen 8513 wand-of-nothing       "plain unremarkable gray wooden wand with a dull rounded tip, utterly mundane and powerless, accent color dull gray"

echo ">>> done"
