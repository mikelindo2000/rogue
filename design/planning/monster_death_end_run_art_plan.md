# Monster-Specific Death End-Run Art Plan

## Goal

When the player dies to a monster, the opening end-run image should usually show
that monster as the culprit. This should feel like the themed floor-background
work: stable generated assets, deterministic variant selection, and clear
progression through the dungeon's monster roster.

Existing special endings still win when they are more story-worthy:

- victory keeps the dedicated `victory-amulet-escape-1.png` opener
- floor-20 deaths keep `death-floor20-[1-6].png`
- starvation deaths keep `death-starvation-[1-6].png`
- achievement-style scenarios keep their current priority above ordinary monster
  deaths: `wall-whisperer`, `dungeon-cleaner`, and `chest-enthusiast`
- non-monster deaths and unknown deaths keep `death-default-[1-6].png`

Monster-specific art is therefore a replacement for ordinary monster deaths, not
a replacement for the special scenario system.

## Current State

- End-run art selection lives in `src/ui/endRunArt.ts`.
- The opening end-run screen calls `pickOpeningEndRunArt(summary)` in
  `src/ui/components/EndRunScreen.svelte`.
- Scenario selection mirrors `chooseRunTitle()` in `src/runStats.ts`.
- `RunSummaryV1` already has `deathCause?: DeathCause` and
  `killedByMonsterId?: string`.
- `buildRunSummary()` can accept `killedByMonsterId`, but
  `GameEngine.finalizeRun()` currently never passes it.
- The monster attack path in `src/monster.ts` mutates `player.hp`, but it does
  not currently return which monster delivered lethal damage.

That means the data model is ready, but the combat plumbing is not.

## Asset Shape

Use three variants per monster. That is enough variety without making the
initial generation pass unwieldy.

```text
public/endings/monster-<monster-id>-<1-3>.png
```

The current `MONSTER_DATABASE` contains 34 templates, so the initial pass is 102
new monster-death images.

Use stable monster ids from `monsterId()` / template `id` fallback semantics. If
a template has no explicit `id`, use the same slug that the bestiary/discovery
uses. Do not invent a parallel slug system for endings.

## Selection Priority

Add a monster-death branch after the existing special death/achievement
scenarios and before default death.

Proposed priority:

1. `won` -> `victory-finale` opener
2. `died && floorReached >= 20` -> `death-floor20`
3. `died && deathCause === 'starvation'` -> `death-starvation`
4. `secretsFound >= 3` -> `wall-whisperer`
5. `monstersKilled >= 40` -> `dungeon-cleaner`
6. `goldCollected >= 1500` -> `chest-enthusiast`
7. `died && deathCause === 'monster' && killedByMonsterId` -> `monster-<id>`
8. fallback -> `death-default` or `victory-default`

This keeps the current special scenarios authoritative. A routine orc death
gets orc art; a floor-20 boss death still gets the near-victory floor-20
scenario; a starving run surrounded by monsters still gets starvation.

## Implementation Plan

### 1. Plumb the killing monster id

Update the monster-AI result path so the engine can identify the monster that
landed lethal damage.

Recommended low-risk shape:

- Add an optional `onPlayerDamaged(monster, damage)` callback to
  `processMonsterAI()`.
- Call it from both `applyAttack()` and `resolvePendingAttack()` after damage is
  applied.
- In `GameEngine.processTurn()`, capture the last monster id whose damage
  reduced player HP during the monster phase.
- Pass that id into `finalizeRun('died', 'monster', killedByMonsterId)`.
- Extend `GameEngine.finalizeRun()` to accept and forward `killedByMonsterId`.

This avoids trying to infer the killer after the loop from HP deltas alone, and
it covers telegraphed attacks as well as adjacent melee.

Tests:

- lethal adjacent monster attack records `deathCause: 'monster'` and the
  monster id
- lethal telegraphed attack records the attacking monster id
- starvation still records `deathCause: 'starvation'` and no monster id
- restore/finalize of old saves remains safe when no killed id exists

### 2. Extend end-run art types and selector

Update `src/ui/endRunArt.ts`:

- add `MonsterDeathEndRunArt` or extend `EndRunArt.scenario` to include
  monster-specific scenarios
- expose `MONSTER_DEATH_ART_FILES`, generated from `MONSTER_DATABASE`
- add `monsterDeathArtFile(monsterId, variant)`
- keep `END_RUN_ART_FILES` for the current scenario pool, and either append
  monster files to an `ALL_END_RUN_ART_FILES` export or document the split
- choose variants with the same stable hash input currently used for ending art

Tests:

- ordinary monster death with `killedByMonsterId: 'orc'` maps to
  `monster-orc-[1-3].png`
- floor-20 monster death still maps to `death-floor20-[1-6].png`
- starvation with `killedByMonsterId` still maps to starvation
- secrets/kills/gold special scenarios still override monster-specific art
- missing/unknown monster ids fall back to `death-default`
- every referenced monster-death file exists once assets are generated

### 3. Add prompt catalogue and generator

Add a local script parallel to `scripts/gen-background-art.mjs`:

```text
scripts/gen-monster-death-art.mjs
```

Use local mflux, not runtime/API generation:

- model: `Runpod/FLUX.2-klein-4B-mflux-4bit`
- base model: `flux2-klein-4b`
- size: `512x512`
- steps: start with `2` for parity with the current end-run image recipe; raise
  `ROGUE_MONSTER_DEATH_STEPS` for a slower polish pass
- seeds: reserve a clean range, for example `11000 + monsterIndex * 10 + variantIndex`
- output: `public/endings/monster-<monster-id>-<variant>.png`
- flags: `--dry-run`, `--force`, `--monster=<id>`

The script should derive the roster from an embedded catalogue that includes:

- monster id
- monster name
- broad visual description
- floor band / mood
- three subject prompts

Do not import `src/config.ts` directly from the generator unless the repo has a
clean Node/TS execution path for that. A checked-in prompt catalogue is more
reviewable and keeps generation reproducible.

### 4. Prompt direction

Shared template:

```text
dark fantasy roguelike game-over splash illustration, the player character has
fallen after being slain by MONSTER, SUBJECT, cinematic square composition for a
game over dialog, dramatic dungeon lighting, smoky charcoal stone atmosphere,
painterly concept art, high contrast, crisp readable focal point, rich shadows,
subtle vignette, no text, no letters, no logo, no border, no UI, no frame
```

Per-monster variants should vary composition rather than identity:

- variant 1: monster looming over fallen gear or the defeated hero
- variant 2: signature attack aftermath or silhouette
- variant 3: environmental clue that still clearly features the monster

Keep all variants readable behind the existing end-run title overlay. Avoid
busy lower-right detail because the close prompt sits there.

### 5. Suggested monster prompt themes

Use the monster's actual identity, not only its glyph:

| Monster | Direction |
| --- | --- |
| Orc | brutal green raider, crude blade, early torchlit dungeon |
| Brown Bat | swarm-shadow or single giant bat silhouette, fluttering darkness |
| Snake | red serpent coil, venom, low stone floor |
| Hobgoblin | yellow-eyed armored goblinoid, spear or cleaver |
| Eagle | pale dungeon raptor, diving strike, feathers in torch smoke |
| Leprechaun | malicious trickster with spilled coins, green glint |
| Jungle Flesheater | carnivorous jungle horror, vines and teeth |
| King Cobra / Kalius King Cobra | regal cobra, hood spread, venom halo |
| Indus Worm | pale burrowing worm, broken floor stones |
| Pygmy / Pantier Pygmy King | small savage king/warrior, bone ornaments |
| Nymph | beautiful thief-like apparition, stolen potion/gold motif |
| Rabid Ostrich | frantic dungeon bird, clawed legs, dust and feathers |
| Minotaur / Michael the Minotaur | horned brute, labyrinth doorway |
| Unicorn | corrupted white unicorn, radiant horn as fatal light |
| Yeti | white-furred brute, frost breath in deep dungeon |
| Troll / Trogdor the Troll | green regenerating monster, heavy club/claws |
| Golem / Gary the Golem | stone guardian, crushing masonry |
| Flying Serpent | neon-green winged serpent, ranged venom/bolt motif |
| Cyclops / Colossal Cyclops | one-eyed giant, huge club, cracked stone |
| Quinotaur | strange hybrid bull-beast, yellow-lit deep vault |
| Xelhua | red ancient giant/war-spirit, mythic deep-floor scale |
| Zombie / Zachary the Zombie | corpse horde or named undead champion |
| Apperation / Agitated Apperation | ghostly apparition, cold spectral light |
| Dragon / Dragon King | dragon flame and final-boss scale |
| Marcus the Brave | golden armored champion, heroic-but-hostile presence |

Named hero/boss variants should look more iconic than their base species, but
they still use monster-specific art only when no higher-priority ending scenario
overrides them.

### 6. Documentation

After implementation, update `design/implemented/end_run_image_generation.md`:

- document the monster-specific naming convention
- state the override priority explicitly
- add the generation recipe and script usage
- include the monster prompt table or link to the script catalogue

Keep `death-default-[1-6].png` as the fallback for unknown causes, traps, old
saves, and missing/invalid monster ids.

## Verification

Minimum proof before landing:

```bash
npm run test:run -- src/ui/endRunArt.test.ts src/engine.test.ts
npm run build
```

Full proof when the working tree is otherwise clean:

```bash
npm run check
```

Manual/browser proof:

- force an orc death and confirm an orc-specific opening image
- force starvation and confirm starvation art still wins
- force floor-20 death and confirm `death-floor20` still wins
- force an achievement-style ordinary monster death and confirm the special
  scenario still wins
- close the image curtain with keyboard and confirm focus lands on Restart

## Open Decisions

- Whether three variants per monster is enough. It gives 99 images and should be
  manageable; six variants would be 198 images.
- Whether named heroes/bosses should get bespoke images in the first pass or
  initially inherit their base species. The stronger version is bespoke for all
  33 templates.
- Whether to add a compact debug/dev hook for forcing end-run summaries, which
  would make visual verification faster without manipulating combat state.
