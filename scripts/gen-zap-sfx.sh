#!/usr/bin/env bash
# Generate the wand/staff "zap" SFX variants via ElevenLabs.
# Mirrors the house production guide:
#   design/implemented/sound_effect_asset_prompts.md (§2 recipe, §1 house suffix).
#
# Plays when a wand is zapped — see `item.zap` in src/audio/events.ts and the
# generic `item-zap` cue in src/audio/manifest.ts (resolveZapClip). One generic
# cue today, randomized across three variants; per-effect zaps would be added
# via ZAP_BY_WAND in the manifest plus their own files.
#
# Usage:  scripts/gen-zap-sfx.sh
# Output: public/audio/sfx/item-zap-0N.mp3
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
  local out="${OUT_DIR}/item-zap-0${n}.mp3"
  echo ">>> item-zap-0${n} (dur ${dur}s, infl ${infl})"
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
  if ! file "$out" | grep -qi 'MPEG'; then
    echo "!!! item-zap-0${n} is not valid audio:" >&2
    head -c 400 "$out" >&2; echo >&2
    exit 1
  fi
}

gen 1 0.7 0.55 "A wand unleashing a crackling bolt of arcane energy, a sharp magical zap with a brief electric sizzle"
gen 2 0.8 0.55 "A magic staff discharging a focused beam of power, a whooshing arcane release with a glassy shimmer tail"
gen 3 0.7 0.55 "A quick wand zap firing a spark of raw magic, a snapping crackle into a soft humming fizzle"

echo "Done. Generated $(ls "$OUT_DIR"/item-zap-*.mp3 | wc -l | tr -d ' ') zap variants in $OUT_DIR"
