# Sound & Music Asset Production — House Guide

This is the **single source of truth** for generating Rogue's audio with ElevenLabs.
Runtime code never calls ElevenLabs (see `SOUND_EFFECTS_SYSTEM_PLAN.md`); this doc is the
asset-production pipeline. The game only ships the final local files under
`public/audio/` and the manifest that indexes them.

> **For agents:** When you add a monster, event, or settings cue that needs sound, come
> here first. Follow the house style, reuse the generation recipe, append the new asset
> to the tables below with its exact prompt, and regenerate. Keep prompts in this doc so
> every clip is reproducible.

---

## 1. House sonic identity

Rogue is a **dark fantasy dungeon roguelike** with an amber/gold, premium-but-restrained
UI (see `src/ui/styles/tokens.css`). Audio should match that: grounded, tactile, a little
lo-fi/retro, never cartoonish (except deliberate trickster comedy), never cinematic-bombast
except for bosses.

Hold every clip to these rules so a mixed bag of generations still sounds like one game:

- **Dry and close.** Minimal reverb tail. The dungeon is tight stone, not a cathedral.
- **Short and legible.** SFX read in well under a second to ~1.5s. They punctuate; they
  never linger or mask the log/visual feedback they accompany.
- **Mono-friendly.** Don't rely on hard stereo placement — the cue must still read collapsed
  to mono.
- **No musical key.** SFX should not imply a melody or pitch center that fights the music bed.
- **Restrained transients.** Punchy, not harsh. Rapid combat stacks these, so avoid clipping
  highs and long bright tails that pile up.
- **Diegetic over synthetic.** Prefer organic/foley character (flesh, metal, cloth, coin,
  stone, wing) over UI beeps. Status warnings may be more abstract but stay warm, not shrill.

### House prompt suffix

Every SFX prompt ends with this shared style tail so generations stay cohesive:

```
— dark fantasy dungeon roguelike, dry and close, minimal reverb, short, clean retro game sound effect
```

Music uses its own tail (see §5).

---

## 2. Generation recipe

API key lives in `~/.secrets` (`ELEVENLABS_API_KEY`). Never echo it. Source it per command:

```bash
set -a; . ~/.secrets 2>/dev/null; set +a
```

### Sound effects — `POST /v1/sound-generation`

```bash
curl -s -o "public/audio/sfx/<name>-01.mp3" \
  -X POST "https://api.elevenlabs.io/v1/sound-generation?output_format=mp3_44100_128" \
  -H "xi-api-key: $ELEVENLABS_API_KEY" -H "Content-Type: application/json" \
  -d '{"text": "<prompt + house suffix>", "duration_seconds": <0.5-1.7>, "prompt_influence": <0.5-0.6>}'
```

Parameters:

- `duration_seconds`: keep tight. UI/coin ~0.5–0.8; combat/equip ~0.8–1.2; boss ~1.5–1.7.
- `prompt_influence`: `0.5` default; `0.55–0.6` when the prompt is specific and you want it
  followed closely (brute, boss). Higher = less model embellishment.
- `output_format`: `mp3_44100_128`. See §6 for the format decision (mp3 today, opus/webm
  is a future pipeline step the API can't emit directly).

Always validate the result is real audio, not a JSON error wrapped in a 200:

```bash
file public/audio/sfx/<name>-01.mp3   # expect: ... MPEG ADTS, layer III ...
```

### Music — `POST /v1/music`

```bash
curl -s -o "public/audio/music/<name>-01.mp3" \
  -X POST "https://api.elevenlabs.io/v1/music?output_format=mp3_44100_128" \
  -H "xi-api-key: $ELEVENLABS_API_KEY" -H "Content-Type: application/json" \
  -d '{"prompt": "<prompt + music suffix>", "music_length_ms": 180000, "force_instrumental": true}'
```

- `music_length_ms`: 3000–600000. Background beds target ~180000 (3 min).
- `force_instrumental: true` — no vocals, ever, for background beds.
- **No loop flag.** Unlike sound effects, the music endpoint can't guarantee a seam. Treat
  music as a long bed that the audio service crossfades; if a true gapless loop is needed,
  that's a post-processing (ffmpeg crossfade) step, not an API option.

### Budget check

```bash
curl -s https://api.elevenlabs.io/v1/user/subscription -H "xi-api-key: $ELEVENLABS_API_KEY" \
 | python3 -c "import json,sys;d=json.load(sys.stdin);print(d.get('character_count'),'/',d.get('character_limit'))"
```

SFX are cheap (≈ prompt length in characters). Music is far heavier — **generate one track,
re-check the counter, then decide on the rest.**

---

## 3. Naming & layout

```
public/audio/sfx/    <event-or-family>-<NN>.mp3     # e.g. combat-hit-01.mp3, death-brute-01.mp3
public/audio/music/  <context>-<NN>.mp3             # e.g. explore-shallow-01.mp3
```

- Numeric suffix `-01`, `-02`, … allows multiple variants the service randomizes between.
- Names map onto the manifest's resolution keys, **not** onto event names one-to-one:
  - Per-archetype death cues are `death-<archetypeId>-01.mp3` and map to the
    `byArchetype` table (see the cascade in `SOUND_EFFECTS_SYSTEM_PLAN.md`).
  - Boss/hero cues are `death-boss-01.mp3` and map to the `bySpecial` tier.
  - Payload variants (e.g. `item.consume` for potion vs food) use a descriptive tail:
    `consume-potion-01.mp3`, `consume-food-01.mp3`.

---

## 4. Sound-effect catalogue (reproducible prompts)

All prompts below implicitly append the **house prompt suffix** from §1. Duration in seconds,
influence is `prompt_influence`.

### Combat

| File | Event | Dur | Infl | Prompt (before suffix) |
| --- | --- | --- | --- | --- |
| `combat-swing-01.mp3` | `combat.swing` | 0.5 | 0.5 | Quick whoosh of a weapon swung through air |
| `combat-hit-01.mp3` | `combat.hit` (player→monster) | 0.8 | 0.6 | Quick visceral sword slash hitting flesh, short sharp impact, fantasy game combat hit |
| `combat-miss-01.mp3` | `combat.miss` | 0.6 | 0.5 | A weapon whiffs through empty air and a foe nimbly dodges aside |
| `player-hit-01.mp3` | `combat.hit` (monster→player) | 0.7 | 0.55 | A dull pained thud as the hero takes a blow, body impact with a short grunt |

### Death (per-archetype cascade → `byArchetype` / `bySpecial`)

| File | Archetype / tier | Dur | Infl | Prompt (before suffix) |
| --- | --- | --- | --- | --- |
| `death-default-01.mp3` | `default` | 0.9 | 0.5 | Generic fantasy creature death, short pained grunt then collapse, dungeon combat |
| `death-skirmisher-01.mp3` | `skirmisher` (Eagle) | 0.9 | 0.5 | Bird of prey death screech cut short, flapping feathers and a soft thud, fantasy game |
| `death-ambusher-01.mp3` | `ambusher` | 0.9 | 0.55 | Lurking creature startled death, sharp hiss into a wet gurgle, dungeon |
| `death-brute-01.mp3` | `brute` | 1.3 | 0.55 | Huge brute monster death, deep guttural groan and a heavy body crashing onto stone |
| `death-kiter-01.mp3` | `kiter` | 1.1 | 0.55 | Arcane ranged caster death, magical energy fizzling and crackling out, dissonant collapse |
| `death-trickster-01.mp3` | `trickster` (Leprechaun) | 1.1 | 0.5 | Mischievous goblin trickster death, a cackle cut short with a comical bright coin jingle, fantasy |
| `death-bat-01.mp3` | `bat` (Brown Bat) | 0.8 | 0.55 | Small bat death, high pitched squeak and fluttering wings stopping abruptly |
| `death-boss-01.mp3` | `special: boss/hero` | 1.7 | 0.6 | Epic boss monster death, dramatic deep roar fading into a cinematic low boom, fantasy victory |

### Player vitals & progression

| File | Event | Dur | Infl | Prompt (before suffix) |
| --- | --- | --- | --- | --- |
| `player-lowhealth-01.mp3` | `player.lowHealth` | 0.8 | 0.5 | A low warning heartbeat thud with a faint uneasy tone, danger |
| `player-criticalhealth-01.mp3` | `player.criticalHealth` | 0.9 | 0.5 | An urgent fast double heartbeat with a tense rising warning sting, near death |
| `player-levelup-01.mp3` | `player.levelUp` | 1.1 | 0.5 | A warm rising chime of empowerment and triumph, magical level up, not too bright |
| `player-death-01.mp3` | `player.death` | 1.5 | 0.55 | A somber low descending tone of defeat, the hero falls, game over, fading |

### Hunger / survival

| File | Event | Dur | Infl | Prompt (before suffix) |
| --- | --- | --- | --- | --- |
| `hunger-hungry-01.mp3` | `hunger.hungry` | 0.7 | 0.5 | A soft low stomach growl with a faint warning tone, getting hungry |
| `hunger-fatigued-01.mp3` | `hunger.fatigued` | 0.8 | 0.5 | A weary heavier stomach growl and tired exhale, fatigued and weakening |
| `hunger-starving-01.mp3` | `hunger.starving` | 0.9 | 0.5 | A hollow desperate stomach pang with an ominous low tone, starving |
| `hunger-starvetick-01.mp3` | `hunger.starveTick` | 0.6 | 0.5 | A short weak pained wince of starvation damage, faint |

### Equipment

| File | Event | Dur | Infl | Prompt (before suffix) |
| --- | --- | --- | --- | --- |
| `equip-weapon-01.mp3` | `equipment.equipWeapon` | 0.8 | 0.55 | A bladed weapon drawn and gripped, metallic shing and a firm settle |
| `equip-armor-01.mp3` | `equipment.equipArmor` | 0.9 | 0.55 | Armor or a shield strapped on, leather creak and a solid metal clasp |
| `equip-unequip-01.mp3` | `equipment.unequipArmor` | 0.8 | 0.55 | Armor unbuckled and removed, leather and metal sliding off, softer |
| `equip-rejected-01.mp3` | `equipment.rejected` | 0.5 | 0.55 | A short dull negative thunk, action refused, can't equip |

### Items

| File | Event | Dur | Infl | Prompt (before suffix) |
| --- | --- | --- | --- | --- |
| `item-pickup-01.mp3` | `item.pickup` (generic gear) | 0.7 | 0.5 | Soft pleasant item pickup chime, retro fantasy RPG inventory blip, short and bright |
| `item-gold-01.mp3` | `item.pickup` (gold) | 0.7 | 0.55 | A handful of gold coins scooped up with a bright jingling clink |
| `consume-potion-01.mp3` | `item.consume` (potion) | 0.9 | 0.5 | Uncorking and gulping a magic potion, liquid glug with a soft magical shimmer |
| `consume-food-01.mp3` | `item.consume` (food) | 0.8 | 0.5 | Eating dry rations, a few quick chewing bites and a satisfied swallow |

### Map / navigation

| File | Event | Dur | Infl | Prompt (before suffix) |
| --- | --- | --- | --- | --- |
| `stairs-down-01.mp3` | `map.stairs` (descend) | 0.9 | 0.5 | Descending stone stairs deeper underground, footsteps with a low ominous drop |
| `stairs-up-01.mp3` | `map.stairs` (ascend) | 0.9 | 0.5 | Climbing stone stairs upward, footsteps with a lighter rising tone |
| `secret-reveal-01.mp3` | `map.secretReveal` | 1.0 | 0.55 | A hidden stone door grinds open revealing a secret passage, soft magical reveal shimmer |

---

## 5. Music catalogue

Music prompts append this **music suffix** for cohesion:

```
— dark fantasy dungeon roguelike score, instrumental, looping bed, no vocals, moderate dynamics
```

Five context beds (~180000 ms each), selected by coarse game state and crossfaded:

| File | Context | Prompt (before suffix) |
| --- | --- | --- |
| `explore-shallow-01.mp3` | floors 1–3, calm exploration | Calm, sparse dark-fantasy dungeon exploration ambience, low drones, soft hand percussion, faint melancholy strings, patient and tense |
| `explore-deep-01.mp3` | floors 4+, tense | Tense deeper dungeon, ominous low strings and distant percussion, creeping dread, slow build, minor key |
| `boss-01.mp3` | boss encounter | Driving dark-fantasy boss battle, urgent low brass and pounding war drums, heroic and dangerous, propulsive |
| `safe-01.mp3` | respite / safe | Warm gentle respite theme, soft harp and low strings, a moment of safety and relief, hopeful but subdued |
| `gameover-01.mp3` | run end / game over | Somber elegiac game-over bed, slow mournful strings and a lone distant horn, fading to quiet |

These map onto the `music` channel and the music-selection rule in the plan. Add or split
beds by editing this table and the manifest, not the engine.

---

## 6. Format decision

- **Today: `mp3_44100_128`.** Universally supported, what the API emits directly, good enough
  for short SFX.
- The plan originally suggested `.webm`; the ElevenLabs API **cannot emit webm**. If size
  becomes a concern (mainly for the ~3-min music beds), transcode to `opus`/`webm` with ffmpeg
  as an asset-pipeline step. Revisit this jointly for music, where size matters most.
- Keep one canonical format per asset checked into `public/audio/`. The manifest references
  the final local file; the game never sees the source format choices.

---

## 7. Provenance

All clips here are generated with ElevenLabs (`eleven_text_to_sound_v2` for SFX, `music_v1`
for music) from the prompts in this doc. No third-party samples. When you regenerate or
replace a clip, update its row (prompt, duration, influence) so the asset stays reproducible.
