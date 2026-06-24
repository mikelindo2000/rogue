#!/usr/bin/env bash
# Generate the heavy-hit "rumble" combat SFX variants via ElevenLabs.
# Mirrors the house production guide:
#   design/implemented/sound_effect_asset_prompts.md (§2 recipe, §1 house suffix).
#
# These play (and the map screen-shakes) on a HEAVY blow — see
# `combat.heavyHit` in src/audio/events.ts and `isHeavyHit` in src/combat.ts.
# Multiple numbered variants let the audio service randomize between them so a
# string of big hits doesn't sound like one looping sample.
#
# Usage:  scripts/gen-combat-rumble-sfx.sh
# Output: public/audio/sfx/combat-rumble-0N.mp3
set -euo pipefail

cd "$(dirname "$0")/.."

# Source the API key (never echoed). See house guide §2.
set -a; . ~/.secrets 2>/dev/null; set +a
: "${ELEVENLABS_API_KEY:?ELEVENLABS_API_KEY not set (expected in ~/.secrets)}"

SUFFIX="— dark fantasy dungeon roguelike, dry and close, minimal reverb, short, clean retro game sound effect"
OUT_DIR="public/audio/sfx"
mkdir -p "$OUT_DIR"

# variant index | duration_seconds | prompt_influence | prompt (before suffix)
gen() {
  local n="$1" dur="$2" infl="$3" prompt="$4"
  local out="${OUT_DIR}/combat-rumble-0${n}.mp3"
  echo ">>> combat-rumble-0${n} (dur ${dur}s, infl ${infl})"
  rm -f "$out"
  curl -s -o "$out" \
    -X POST "https://api.elevenlabs.io/v1/sound-generation?output_format=mp3_44100_128" \
    -H "xi-api-key: $ELEVENLABS_API_KEY" -H "Content-Type: application/json" \
    -d "$(python3 - "$prompt $SUFFIX" "$dur" "$infl" <<'PY'
import json, sys
text, dur, infl = sys.argv[1], float(sys.argv[2]), float(sys.argv[3])
print(json.dumps({"text": text, "duration_seconds": dur, "prompt_influence": infl}))
PY
)"
  # Fail loudly if the API returned a JSON error wrapped in a 200.
  if ! file "$out" | grep -qi 'MPEG'; then
    echo "!!! combat-rumble-0${n} is not valid audio:" >&2
    head -c 400 "$out" >&2; echo >&2
    exit 1
  fi
}

gen 1 0.9 0.6 "Deep heavy weapon impact, a massive blow landing on flesh and bone with a low rolling rumble and stone shudder"
gen 2 1.0 0.6 "Bone-crunching heavy hit, thick low-frequency thud followed by a short cavern rumble and falling grit"
gen 3 0.9 0.6 "Powerful blunt impact, deep sub-bass boom with a brief rumbling aftershock through dungeon stone"
gen 4 1.0 0.6 "Massive crushing strike, heavy meaty smack into a low earthen rumble, dust and pebbles trembling"

echo "Done. Generated $(ls "$OUT_DIR"/combat-rumble-*.mp3 | wc -l | tr -d ' ') rumble variants in $OUT_DIR"
