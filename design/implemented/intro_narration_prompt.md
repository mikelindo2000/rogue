# Intro narration — ElevenLabs generation notes

The first-run intro gate (`src/ui/components/IntroScreen.svelte`) offers a
"Hear the warning" button that plays a pre-generated narration. The clip is
committed at `public/audio/voice/intro-warning-01.mp3` and is **not** generated at
runtime (no API key ships in the client). Re-generate it offline if the script or
voice changes.

## Voice

- **Voice:** Callum — "Husky Trickster" (`N2lVS1w4EtoT3dr4eOWO`) — a sinister,
  taunting delivery that fits the DungeonMaster persona.
- **Model:** `eleven_multilingual_v2`
- **Settings:** stability `0.45`, similarity_boost `0.8`, style `0.45`,
  use_speaker_boost `true`
- **Output:** `mp3_44100_128`

## Script

> So. Another wretch crawls into my dungeon. You come for the Amulet of Ballard,
> as so many did before you. Descend, if your nerve holds. Eat, or starve in the
> dark. Fight, or be devoured. Twenty floors lie between you and the prize... and
> not one soul has ever carried it back out. The stairs are waiting. I am
> waiting. Do try to be entertaining.

## Regenerate

The key lives in `~/.secrets` as `ELEVENLABS_API_KEY` (never commit it):

```bash
source ~/.secrets
SCRIPT="So. Another wretch crawls into my dungeon. ..."  # full script above
BODY=$(python3 -c "import json,sys; print(json.dumps({'text': sys.argv[1], 'model_id':'eleven_multilingual_v2', 'voice_settings':{'stability':0.45,'similarity_boost':0.8,'style':0.45,'use_speaker_boost':True}}))" "$SCRIPT")
curl -s -X POST "https://api.elevenlabs.io/v1/text-to-speech/N2lVS1w4EtoT3dr4eOWO?output_format=mp3_44100_128" \
  -H "xi-api-key: $ELEVENLABS_API_KEY" -H "Content-Type: application/json" \
  --data "$BODY" -o public/audio/voice/intro-warning-01.mp3
```
