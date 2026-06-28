#!/usr/bin/env bash
# Generate painted inventory art for NAMED gear that lives outside GEAR_POOL:
#   - starting loadout from createPlayer() (src/player.ts)
#   - flavor-named monster drops from MONSTER_DROPS (src/drops.ts)
# These resolve art by slugify(item.name), so each needs a matching PNG.
# Enumerated by src/assetManifest.ts (starting-gear + gear-drops groups) and
# guarded by src/assetManifest.test.ts. Mirrors gen-gear-art.sh: deterministic
# mflux flux2-klein at 8 steps, public/inventory/<slug>.png. Idempotent.
#
# Seeds reserve the 8720+ block (gear baseline 8400+, wands 8500-8513, scrolls
# 8520-8537/9000, weapon-class expansion 8700-8715).
#
# NOTE: short-bow.png (a GEAR_POOL item) is generated with the braid Gemini
# adapter, not here — mflux kept rendering a double-grip bow. See
# design/implemented/inventory_image_generation.md.
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

# --- Starting gear (src/player.ts) ---
gen 8720 iron-dagger             "a plain simple iron dagger with a worn leather-wrapped grip, accent color dull iron gray"
gen 8721 tattered-rags           "a tattered ragged cloth shirt, frayed and patched, poor and threadbare, accent color faded brown"

# --- Monster gear drops (src/drops.ts) ---
gen 8722 giant-thighbone         "a massive two-handed club made from a giant's femur thighbone, crude and heavy, accent color bone ivory"
gen 8723 sapphire-enlayed-dagger "an ornate dagger with a polished blade and a sapphire gem inlaid in the hilt, accent color sapphire blue"
gen 8724 talon-dagger            "a curved dagger shaped like a raptor talon with a hooked clawed point, accent color dark steel"
gen 8725 thick-leafy-armor       "body armor woven from thick overlapping green leaves and vines, natural and rugged, accent color forest green"
gen 8726 staff-of-seduction      "an elegant enchanting wizard staff topped with a rose-pink crystal radiating alluring charm, accent color rose pink"
gen 8727 spiny-feathered-bow     "an exotic short bow adorned with spiny quills and ruffled feathers, accent color earthy brown and crimson"
gen 8728 labrynth-pole           "a long two-handed iron pole weapon from an ancient labyrinth, weathered and rune-etched, accent color rusted iron"
gen 8729 untarnished-horn        "a single gleaming untarnished spiral unicorn horn wielded as a dagger, pristine and pearlescent, accent color pearl white"
gen 8730 stolen-poker            "a crude improvised sword made from a stolen iron fireplace poker, accent color blackened iron"
gen 8731 xelhua-s-carbonsteel    "dark carbon-steel plate armor of forbidding craftsmanship, accent color black steel with faint blue sheen"
gen 8732 cow-hide-armor          "rugged body armor of stitched brown-and-white cow hide leather, accent color brown and cream"
gen 8733 splintered-horn         "a jagged splintered horn fragment wielded as a dagger, cracked and sharp, accent color tan bone"
gen 8734 serpent-leather-armor   "supple scaled serpent-leather armor of overlapping snake scales, accent color olive green"
gen 8735 hardened-fists          "a pair of hardened spiked iron knuckle gauntlets for brawling, accent color iron gray"
gen 8736 scale-armor             "body armor of overlapping dragon scales catching cold rim light, accent color crimson and bronze"
gen 8737 black-onyx-sword        "a one-handed sword with a gleaming polished black onyx blade, accent color black with violet sheen"
gen 8738 kalius-barb             "a venomous serpent-fang dagger dripping with cobra venom, accent color toxic green"
gen 8739 king-s-staff            "a regal royal wizard staff topped with a golden crown finial and a glowing gem, accent color royal gold"
gen 8740 tiny-booties            "a pair of tiny worn small leather boots, humble and well-used, accent color soft brown"
gen 8741 skull-of-michael        "a grim round shield fashioned from a massive horned minotaur skull, accent color bleached bone"
# michael-s-armor: mflux drew the whole minotaur wearing the armor, not the
# item. Regenerated with the braid Gemini adapter (empty horned cuirass) — see
# the Gemini overrides table in the design doc. Do NOT regenerate here.
# gen 8742 michael-s-armor       "heavy brutal plate armor of a minotaur champion with horned pauldrons, accent color dark iron and rust"
gen 8743 golemic-claymore        "an enormous two-handed claymore greatsword carved from solid stone and clay, accent color earthen gray"
gen 8744 hardened-clay-armor     "thick body armor of baked hardened clay plates, cracked and earthen, accent color terracotta"
gen 8745 subcolossal-mace        "a massive oversized one-handed stone mace, brutally heavy, accent color granite gray"
gen 8746 dragonslayer-s-tenacity "legendary dragonslayer plate armor glowing with golden runes and dragon-scale trim, accent color radiant gold"
gen 8747 king-ellowyn-s-cutlass  "a legendary royal cutlass with a golden basket hilt and a curved gleaming rune-etched blade, accent color regal gold"

echo ">>> done"
