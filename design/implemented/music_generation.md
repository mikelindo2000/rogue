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

- **`explore-shallow-01.mp3`** (floors 1–3, the opening bed) — tense,
  anticipatory "gathering storm":
  > Tense, anticipatory dark-fantasy orchestral instrumental. A slow, brooding,
  > patient build: low sustained strings and soft cello drones, a quiet pulsing
  > bass heartbeat, distant muffled timpani, sparse lonely piano and harp notes
  > hanging in cold air, faint ominous swells. Restrained and atmospheric, heavy
  > with foreboding and suspense, like a storm gathering on the horizon that has
  > not yet broken. Minor key, unresolved and uneasy, cinematic and spacious. No
  > whistles, no cheerful folk, no fiddle jigs, no vocals, no big climax. Seamless
  > looping background music for cautiously exploring a dangerous dungeon.

Other beds (`explore-deep`, `boss`, `safe`, `gameover`, `victory-credits`) were
part of the original audio drop; document their prompts here if/when regenerated.
