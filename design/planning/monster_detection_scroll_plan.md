# Scroll of Monster Detection Plan

Status: **planned**.

Add a new named scroll, **Scroll of Monster Detection**, that reveals live monster
positions on the current floor without turning those monsters into line-of-sight
targets. This is the monster counterpart to Food Detection and Gold Detection,
but monsters move, so the feature needs a temporary live-sense channel rather
than a one-shot explored-tile stamp.

## Product Shape

The player experience:

- Find and carry a Scroll of Monster Detection like any other named scroll.
- Press `r`, choose the scroll in the existing scroll-focused inventory modal,
  and read it with Return or the modal's Read action.
- For a short duration, every monster on the current floor is shown as a dim
  psychic glyph even if it is outside FOV or standing on an unexplored tile.
- The scroll never reveals terrain, secret doors, traps, items, or pathing.
- Detected monsters are **not visible monsters** for combat, Hold Monster,
  targeting, nearby-monster portrait, AI behavior, or hover/click line-of-sight
  affordances.

Recommended tuning:

- `ScrollType`: `monster_detection`
- Display name: `Scroll of Monster Detection`
- Spawn role: `situational`
- `minFloor`: 5
- Suggested weights: early `0`, mid `3`, deep `4`
- Duration: `BALANCE.scrolls.monsterDetectionTurns = 30`
- No-op behavior: consumes and spends a turn even if no monsters are present,
  matching Food Detection and Gold Detection.

Thirty turns is long enough to use the information tactically after the read's
monster turn resolves, but short enough that it remains an information consumable
instead of permanent omniscience.

## Design Boundaries

Do not implement this by setting `visible[y][x] = true`.

`visible` is a gameplay signal, not just a render signal. It currently gates
monster drawing, Hold Monster, nearby-monster chrome, combat portraits, telegraph
visibility, and discovery side effects. Monster Detection should add a separate
"sensed" presentation layer so it cannot accidentally become ranged sight,
freeze-through-walls, or AI leakage.

Do not piggyback on Magic Mapping.

Magic Mapping reveals layout and remembered tiles. Monster Detection reveals
creatures only. A monster detected in black space should draw as a floating
psychic glyph over black, not reveal the floor tile beneath it.

Do not make this a compendium completion shortcut.

The scroll may mark detected monster species as `seen` because the scroll has
revealed their identity, but it must not mark them `defeated`, expose exact
stats, count as a kill, or unlock defeated-tier cinematic previews.

## Implementation Plan

### Phase 1 - Catalog, Visuals, and Spawn Tuning

Touch points:

- `src/types.ts`
- `src/itemVisuals.ts`
- `src/scrolls.ts`
- `src/ui/icons.ts`
- `public/inventory/scroll-of-monster-detection.png`
- `design/implemented/inventory_image_generation.md`

Add `monster_detection` to `ScrollType`, `SCROLL_TYPES`, `SCROLL_VISUALS`, and
the `SCROLLS` registry. The registry entry should be side-effect free, as with
the existing scrolls:

- `summary`: "Senses every monster on this floor."
- `detail`: "For a short time, monster glyphs pulse through walls and darkness.
  They are sensed, not in sight."
- `rarity`: `uncommon`
- `harmful`: `false`
- `needsTarget`: `none`
- `noOpKeepsScroll`: `false`

Add a compact scroll icon with an eye/glyph/radar motif. Generate or add the full
inventory PNG according to `design/implemented/inventory_image_generation.md`,
then add the prompt row there so the asset remains reproducible.

After the engine effect is wired, add `monster_detection` to
`IMPLEMENTED_SCROLLS` and `SCROLL_TUNING`.

### Phase 2 - Engine State and Effect

Touch points:

- `src/config.ts`
- `src/types.ts`
- `src/engine.ts`
- `src/persistence/savegame.ts`
- `src/persistence/savegame.test.ts`

Add a persisted status counter, preferably
`StatusEffects.monsterDetectionTurns`, defaulting to `0`.

Because `StatusEffects` is part of the save shape, bump the save version and
migrate older saves by backfilling `monsterDetectionTurns: 0`. Keep this
coordinated with any other active plan that touches save data.

Add `case 'monster_detection'` to `applyScrollEffect()`:

- Set `statusEffects.monsterDetectionTurns` to the configured duration.
- Mark detected monster species as `seen` in discovery, using the same
  `monsterId()` / `markSeen()` flow as FOV sightings. Sync discovery only if the
  set changed.
- Log:
  - With monsters: `You read the Scroll of Monster Detection. Shapes burn in your mind.`
  - Without monsters: `You read the Scroll of Monster Detection, but sense no monsters on this floor.`
- Return `true` so the scroll is consumed and a turn passes.

Decrement the counter in the normal status-effect tick. Clear it on floor change
unless product testing shows cross-floor carryover is more fun; the recommended
first slice is current-floor only.

Important sequencing: the scroll read spends a turn, so monsters may move during
`processTurn()`. The sensed overlay should derive from current `this.monsters`
each render/update while the status is active, not from positions captured before
the monster turn.

### Phase 3 - Rendering and UI State

Touch points:

- `src/ui/store.svelte.ts`
- `src/ui.ts`
- `src/ui/components/*` only if a small status indicator is wanted

Extend the render state with a non-FOV signal such as
`monsterDetectionActive: boolean`, or a derived `detectedMonsters` list.

In the canvas renderer:

- Draw regular monsters exactly as today when `visible[m.y][m.x]` is true.
- If Monster Detection is active and the monster is not visible, draw a dim,
  pulsing glyph at its current tile.
- Use lower alpha and a distinct tint/ring so sensed monsters read differently
  from visible monsters.
- Allow sensed glyphs on unexplored tiles without drawing the underlying terrain.
- Do not include sensed monsters in occupied-floor-dot dimming unless the tile is
  explored; otherwise the renderer would leak floor context.

Keep overlays scoped:

- `ui.nearbyMonster` and combat portrait continue to use `visible`.
- Telegraphs continue to render only when their target tile is visible.
- Pointer hover/tooltip behavior should either ignore sensed monsters or show a
  deliberately limited "sensed monster" tooltip. Do not reuse the full visible
  monster tooltip without checking line-of-sight assumptions.

Optionally add a small status chip in the HUD if the existing status surface has
room, but the map overlay and log line are enough for the first slice.

### Phase 4 - Audio

No runtime audio-generation code.

The existing `item.consume` event already carries `scrollType`; if no dedicated
clip exists, the manifest falls back to the generic consume cue. A later audio
asset pass can add a per-effect Monster Detection cue by following:

- `design/implemented/sound_effects_system_plan.md`
- `design/implemented/sound_effect_asset_prompts.md`

If a new clip is authored, add the prompt row, local asset, and manifest mapping
there. Do not call ElevenLabs from game code.

## Keyboard and Interaction Requirements

No new global shortcut is required. The feature rides the existing scroll flow:

- `r` opens the scroll-focused chooser.
- Arrow keys move through scroll choices.
- Return reads the selected scroll.
- `r` inside the scroll modal reads the selected scroll when it is a scroll.
- Escape closes the modal without consuming anything.

Verification must include this keyboard path, because Rogue's project rule is
keyboard parity for every gameplay feature.

## Test Plan

Unit tests:

- `src/scrolls.test.ts`
  - `monster_detection` has a registry definition and visual metadata.
  - Spawn tuning includes it once it is implemented.
  - It does not spawn below floor 5.
- `src/engine.scrolls.test.ts`
  - Reading the scroll sets `monsterDetectionTurns`, consumes the scroll, and
    spends a turn.
  - Reading it on a floor with no monsters still consumes and logs the empty
    result.
  - Detection does not set `visible[y][x]` or `explored[y][x]` for an off-screen
    monster.
  - Detected species are marked `seen` but not `defeated`.
  - The sensed state uses post-turn live monster positions rather than a stale
    pre-turn snapshot.
- `src/persistence/savegame.test.ts`
  - Older saves backfill `monsterDetectionTurns: 0`.
  - Active detection survives save/restore if the status is persisted.

UI/component tests:

- Add a renderer-level test or small extracted helper test proving a visible
  monster is drawn normally while a sensed-only monster uses the detected style.
- Inventory modal keyboard coverage should not need new tests unless the new
  scroll exposes a missing modal edge case.

Manual/browser proof:

1. Start a run with a Scroll of Monster Detection in inventory.
2. Use only the keyboard: `r`, arrows if needed, Return.
3. Confirm off-screen monsters appear as sensed glyphs without revealing terrain.
4. Confirm walking into line of sight changes the monster to the normal visible
   glyph.
5. Confirm Hold Monster still affects only monsters in FOV, not every sensed
   monster.
6. Confirm the sensed overlay expires and clears on floor transition.

## Open Questions

- Should sensed monsters show names on hover, or only glyphs? Recommendation:
  glyphs first, names only if the bestiary `seen` tier is already unlocked or the
  scroll itself just marked that species seen.
- Should the duration be 30 turns or floor-long? Recommendation: 30 turns for
  the first slice; floor-long can be a rare upgraded item later.
- Should the scroll reveal invisible monsters if such monsters ship later?
  Recommendation: yes, unless a future invisibility mechanic explicitly defines
  "undetectable" monsters.
