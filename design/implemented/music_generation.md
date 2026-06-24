# Music Generation

Background music beds in `public/audio/music/` are generated with the ElevenLabs
**Music API** (the `compose` endpoint — distinct from the text-to-sound-effects
and text-to-speech endpoints). Runtime code never calls ElevenLabs; it only reads
the static files via `MUSIC_TRACKS` in `src/audio/manifest.ts`. The runtime loops
and crossfades these beds (the Music API has no loop flag).

Targets: ~3:00 beds (~1:30 for the credits bed), `mp3_44100_128`.

## Recipe

The key lives in `~/.secrets` as `ELEVENLABS_API_KEY` (never commit it):

```bash
source ~/.secrets
PROMPT="...see per-track prompts below..."
BODY=$(python3 -c "import json,sys; print(json.dumps({'prompt': sys.argv[1], 'music_length_ms': 180000}))" "$PROMPT")
curl -s -X POST "https://api.elevenlabs.io/v1/music?output_format=mp3_44100_128" \
  -H "xi-api-key: $ELEVENLABS_API_KEY" -H "Content-Type: application/json" \
  --data "$BODY" -o public/audio/music/explore-shallow-01.mp3
```

## Per-track prompts

- **`explore-shallow-01.mp3`** (floors 1–3, the opening bed) — warm, melodic
  "Shire" pastoral:
  > Warm pastoral Celtic folk instrumental in the style of a peaceful green
  > shire. Gentle lilting tin whistle and pennywhistle melody over soft acoustic
  > guitar, mandolin, and light fiddle, with a cozy rustic countryside feel.
  > Hopeful, whimsical, and inviting, an easygoing 6/8 lilt, major key, soft and
  > uplifting, evoking rolling hills and a snug village. Fully instrumental, no
  > vocals, no drum hits, seamless gentle loop suitable as calm background music
  > for the opening of a fantasy adventure.

Other beds (`explore-deep`, `boss`, `safe`, `gameover`, `victory-credits`) were
part of the original audio drop; document their prompts here if/when regenerated.
