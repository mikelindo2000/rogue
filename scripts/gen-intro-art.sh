#!/usr/bin/env bash
# Generate the first-run intro/How-to-Play screen background.
# Mirrors design/implemented/end_run_image_generation.md (full-scene splash
# recipe). Output is shown low-opacity behind the intro gate panel, so it wants
# a strong atmospheric mood with no busy detail in the dead center.
set -euo pipefail

cd "$(dirname "$0")/.."

MODEL="Runpod/FLUX.2-klein-4B-mflux-4bit"
BASE="flux2-klein-4b"
STEPS=8
PRE="dark fantasy roguelike splash illustration, "
POST=", cinematic composition, dramatic torch and lantern lighting, smoky charcoal stone atmosphere, deep cold shadows with warm accents, painterly concept art, high contrast, rich shadows, heavy vignette, ominous and epic mood, no text, no letters, no logo, no border, no UI, no frame, no characters facing camera"

gen() {
  local seed="$1" slug="$2" subject="$3"
  local out="public/intro/${slug}.png"
  mkdir -p public/intro
  echo ">>> [$seed] $slug"
  rm -f "$out"
  mflux-generate-flux2 --model "$MODEL" --base-model "$BASE" \
    --steps "$STEPS" --width 512 --height 512 --seed "$seed" \
    --prompt "${PRE}${subject}${POST}" --output "$out" >/dev/null 2>&1
}

# Intro background reserves seed 9200.
gen 9200 intro-bg "a lone hooded wretch holding a small lantern at the mouth of a vast ancient dungeon, a wide stone stairway descending into deep darkness before them, a faint distant amulet glow far below in the depths, towering carved archway, dust and embers drifting"

echo ">>> done"
