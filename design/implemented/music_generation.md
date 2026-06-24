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

- **`explore-shallow-01.mp3`** (floors 1–3, the opening bed) — melodic,
  anticipatory cinematic theme (driving ostinato + a real melody, not ambient).
  Reference idiom: epic fantasy-film "the journey begins" cues built on a
  running low-string ostinato under a noble minor-key theme:
  > Epic cinematic fantasy film score, anticipatory and building, in the style of
  > a grand adventure beginning. A driving, propulsive low string ostinato —
  > steady running eighth-note cellos and basses — creates forward momentum and
  > rising tension, while a clear, memorable, noble minor-key melodic theme soars
  > over the top on solo cello and french horn. Brooding yet adventurous: a sense
  > of an approaching threat and a great journey setting out, something powerful
  > brewing just over the horizon but not yet arrived. Lush orchestral strings,
  > distant calling horns, a subtle timpani pulse, dark and stirring. Strong
  > thematic melody, NOT ambient, NOT sparse, NOT a drone. Minor key, mid-tempo,
  > fully instrumental, no vocals, no whistles, no folk fiddle jigs. Seamless
  > looping background music for a perilous fantasy dungeon adventure.

Other beds (`explore-deep`, `boss`, `safe`, `gameover`, `victory-credits`) were
part of the original audio drop; document their prompts here if/when regenerated.
