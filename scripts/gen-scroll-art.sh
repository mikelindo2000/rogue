#!/usr/bin/env bash
# Generate painted inventory art for the scroll line.
# Mirrors design/implemented/inventory_image_generation.md and the wand/staff
# generator: deterministic mflux outputs at public/inventory/<slug>.png.
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

# Scroll of Light = seed 8500 and already exists. New scrolls reserve 8520+.
gen 8520 scroll-of-repair              "aged rolled parchment scroll tied with cord, silver anvil and mending rune, tiny sparks stitching a cracked shield, accent color silver blue"
gen 8521 scroll-of-magic-mapping       "unfurled aged parchment scroll with glowing dungeon corridors and room outlines drawn in blue ink, accent color blueprint blue"
gen 8522 scroll-of-teleportation       "aged parchment scroll twisting around a violet portal spiral, edges lifting in impossible wind, accent color portal violet"
gen 8523 scroll-of-hold-monster        "aged rolled parchment scroll bound by spectral chains around a clawed shadow silhouette, accent color spectral teal"
gen 8524 scroll-of-sleep               "aged parchment scroll with a pale crescent moon rune shedding soft blue sleep mist, accent color drowsy periwinkle"
gen 8525 scroll-of-create-monster      "torn aged parchment scroll with a red summoning circle and an emerging clawed silhouette, accent color summoning red"
gen 8526 scroll-of-aggravate-monsters  "aged parchment scroll marked with a black horn rune radiating angry orange sound waves, accent color alarm orange"
gen 9000 scroll-of-enchant-weapon      "aged parchment scroll with a simple blue sword icon painted on the parchment, plain clean corners, no decorative marks, accent color rune blue"
gen 8528 scroll-of-enchant-armor       "aged parchment scroll wrapped around a faintly glowing breastplate rune, hardened green ward lines, accent color warding green"
gen 8529 scroll-of-protect-armor       "aged parchment scroll with a shield rune under a golden warding dome, accent color golden ward"
gen 8530 scroll-of-remove-curse        "aged parchment scroll with broken black chains dissolving into white sparks, accent color cleansing white"
gen 8531 scroll-of-identify            "aged parchment scroll with a bright eye rune and small revealed item silhouettes in lavender light, accent color revealing lavender"
gen 8532 scroll-of-food-detection      "aged parchment scroll with warm amber bread and herb runes pulsing outward, accent color warm amber"
gen 8533 scroll-of-gold-detection      "aged parchment scroll with coin sigils glowing through dungeon dust, accent color coin gold"
gen 8534 scroll-of-monster-confusion   "aged parchment scroll with a crimson hand rune and spiraling disorientation marks, accent color dizzy crimson"
gen 8535 scroll-of-scare-monster       "aged parchment scroll with a frightening theatrical mask rune casting long shadows, symbol only, no circular glyphs, no inscriptions or signatures, accent color fearful gray"
gen 8536 scroll-of-blank-paper         "plain aged blank parchment scroll tied with cord, no markings, subdued and mundane, accent color muted beige gray"

echo ">>> done"
