# Sound Effects System — Plan

Status: **proposed** (design only — implementation deferred pending review)
Date: 2026-06-23

## Goal

Add a durable sound effects foundation that can grow from a handful of combat and
status cues into a richer audio layer without pushing browser audio details or asset
generation concerns into the game engine.

The first implementation should support:

- combat cues: swing, hit, miss/dodge, monster death, player hit, boss defeat
- survival cues: health and hunger threshold warnings, starvation ticks
- equipment cues: weapon equip, shield/armor equip, armor removed, illegal equip
- item cues: pickup, potion, food, stairs, search reveal
- global settings: mute and volume, restored when the player returns

Sound assets may be generated with ElevenLabs, but runtime code should only know
about local audio files and metadata. The generator is an asset-production pipeline,
not an engine dependency.

## Non-goals

- Do not call ElevenLabs from the game client or from `GameEngine`.
- Do not make sound required for gameplay feedback. Every important sound event must
  still have visual/log feedback.
- Do not block gameplay while sounds load or fail.
- Do not persist per-run sound state in save games. Mute/volume are global settings.
- Do not add background music in the first slice. Ambient loops can use the same
  service later, but they need different lifecycle rules.

## Core architecture

Use a three-layer boundary:

```
engine/gameplay -> typed sound events -> browser audio runtime
```

Recommended modules:

```
src/audio/
  events.ts          — SoundEvent union, helpers, channels, priorities
  manifest.ts        — local asset registry and default tuning
  service.ts         — AudioService: preload, play, mute, volume, unlock
  service.test.ts
  events.test.ts

src/persistence/
  settings.ts        — settings.audio.{muted,volume}

public/audio/sfx/
  manifest.json      — optional generated/indexed asset metadata
  *.webm / *.mp3     — runtime assets
```

`GameEngine` should emit domain-level events, not filenames:

```ts
sound.emit({ type: 'combat.hit', actor: 'player', target: monster.name, damage });
sound.emit({ type: 'hunger.hungry', hunger: this.player.hunger });
sound.emit({ type: 'equipment.equipArmor', slot: 'chest', rarity: 'common' });
```

The audio layer resolves those events to assets, volume multipliers, cooldowns, and
polyphony rules. This keeps future asset swaps cheap and keeps game tests free of
browser audio APIs.

## Event boundary

Introduce a small dependency passed into `GameEngine`:

```ts
export interface SoundSink {
  emit(event: SoundEvent): void;
}
```

The default sink is a no-op for tests and non-browser contexts. `main.ts` wires the
browser implementation:

```ts
const audio = createAudioService(loadSettings().audio);
const engine = new GameEngine(ui_, audio);
```

This avoids importing `HTMLAudioElement`, `AudioContext`, or settings code into
engine modules. Existing tests can instantiate `new GameEngine(ui)` with no sound
sink, while new tests can inject a recording sink and assert emitted events.

## Event taxonomy

Start with names stable enough for code, broad enough for asset iteration:

| Event | First triggers |
| --- | --- |
| `combat.swing` | before a player or monster strike animation |
| `combat.hit` | `executeStrike` after damage is known; monster AI when player HP drops |
| `combat.crit` | future high-roll or special strike |
| `combat.miss` | evasive monster dodge / monster whiff |
| `combat.death` | normal monster death |
| `combat.bossDeath` | required boss death |
| `player.levelUp` | `gainXp` returns leveled |
| `player.lowHealth` | HP crosses warning/critical thresholds downward |
| `player.death` | game over |
| `hunger.hungry` | hunger crosses `BALANCE.player.hungerHungry` downward |
| `hunger.fatigued` | hunger crosses `BALANCE.player.hungerFatigued` downward |
| `hunger.starving` | hunger reaches 0 |
| `hunger.starveTick` | starvation damage tick, cooldown-limited |
| `equipment.equipWeapon` | main/off-hand weapon changed |
| `equipment.equipArmor` | armor slot or shield changed from none/other item |
| `equipment.unequipArmor` | armor slot or shield changed to none |
| `equipment.rejected` | invalid equip attempt |
| `item.pickup` | gold, food, potion, gear, scroll pickup |
| `item.consume` | food/potion/scroll used |
| `map.stairs` | up/down floor travel |
| `map.secretReveal` | secret door reveal |
| `ui.open` / `ui.close` | settings/inventory/bestiary modal transitions, optional |

Prefer fewer event names with useful payloads over many asset-specific names. For
example, `equipment.equipArmor` can carry `{ slot, rarity }`; the manifest can decide
whether rare armor gets a different clip.

## Threshold rules

Threshold sounds need stateful crossing detection so they do not chatter every turn.

Track previous vitals inside the engine or a tiny `SoundStateTracker`:

- `lowHealth`: play when HP crosses below 50 percent.
- `criticalHealth`: play when HP crosses below 25 percent.
- `hunger.hungry`: play when hunger crosses below `hungerHungry`.
- `hunger.fatigued`: play when hunger crosses below `hungerFatigued`.
- `hunger.starving`: play once when hunger first reaches 0.
- `hunger.starveTick`: play at most once every N turns while starvation damage
  continues.

Reset threshold gates when the value recovers above a hysteresis boundary:

- HP warning can re-arm above 60 percent; critical can re-arm above 35 percent.
- hunger warning can re-arm above its threshold plus a small buffer, usually after
  eating.

This lets eating, healing, and Vigor make future warnings meaningful without creating
constant beeps during ordinary turn processing.

## Equipment detection

Current equip paths are:

- `GameEngine.equipGear(slot, value)` for equipment popovers
- `GameEngine.equipInventoryItem(ref)` for inventory actions
- `performInventoryAction(..., 'equipOffHand')` for explicit off-hand weapon equip
- `equipValidated` in `src/player.ts` for the shared mutation rules

Do not put audio in `src/player.ts`; it should stay pure validation/mutation logic.
Instead, capture the equipped snapshot before and after the engine command:

```ts
const before = snapshotEquipped(this.player);
const equipped = equipValidated(...);
emitEquipmentSounds(before, snapshotEquipped(this.player), equipped);
```

Rules:

- If equip failed, emit `equipment.rejected`.
- If a weapon slot changed, emit `equipment.equipWeapon`.
- If an armor/shield slot changed from item to item, emit `equipment.equipArmor`.
- If an armor/shield slot changed to `None`, emit `equipment.unequipArmor`.
- If a two-handed weapon auto-clears off-hand, emit both the weapon equip and the
  off-hand unequip cue, but let the audio service de-duplicate with a short cooldown.

## Audio runtime

Use Web Audio for the main service, with an `HTMLAudioElement` fallback only if
needed. Web Audio gives better control over global volume, polyphony, and future
mixing.

Core responsibilities:

- lazy-unlock audio on the first trusted keyboard or pointer input
- preload core clips after unlock; defer rare/boss clips until needed
- keep a global gain node for volume
- set gain to zero, or suspend playback, when muted
- cap polyphony per event and globally
- apply cooldowns for noisy events like hunger/starvation and repeated misses
- never throw to gameplay; failed assets log a warning once and then become silent

Recommended settings shape, aligned with `PERSISTENCE_AND_SETTINGS_PLAN.md`:

```ts
export interface AudioSettings {
  muted: boolean;
  volume: number; // 0..1, default 0.7
}
```

Use the persisted `muted` flag as the user's intent. If browser autoplay policy blocks
audio before the first input, do not flip `muted`; keep the service in a locked state
and unlock on the first game key/click.

## Manifest and assets

Runtime code reads from a typed manifest:

```ts
export interface SoundAsset {
  id: string;
  src: string;
  event: SoundEventType;
  channel: 'combat' | 'status' | 'equipment' | 'item' | 'ui';
  volume?: number;
  variants?: string[];
  cooldownMs?: number;
  maxVoices?: number;
  priority?: number;
}
```

Suggested first asset folder:

```
public/audio/sfx/
  combat-hit-01.webm
  combat-miss-01.webm
  combat-death-01.webm
  player-hit-01.webm
  hunger-warning-01.webm
  hunger-starving-01.webm
  armor-equip-01.webm
  armor-unequip-01.webm
  weapon-equip-01.webm
  item-pickup-01.webm
  potion-drink-01.webm
  stairs-01.webm
  secret-reveal-01.webm
```

Keep ElevenLabs prompt/source notes outside the engine, preferably in a design or
asset-production doc:

```
design/SOUND_EFFECT_ASSET_PROMPTS.md
```

That doc can list prompt text, intended duration, license/provenance, generated
filename, selected runtime filename, and replacement notes. The game only imports
the final local asset manifest.

## Settings UI

Add sound controls to a settings surface. If the persistence/settings plan has not
landed yet, implement the reusable settings store first, then add the UI.

Required controls:

- global mute toggle
- volume slider, range `0..100`, stored as `0..1`
- optional "test sound" button

Keyboard-first requirements from `AGENTS.md`:

- settings open/close shortcut, likely `,` or `?` depending on final controls map
- Tab/Shift+Tab moves through controls predictably
- arrow keys adjust the volume slider
- Return/Space toggles mute and activates the test sound button
- Escape closes settings and restores focus to the game canvas or the button that
  opened settings
- game movement/search/eat shortcuts are inactive while the settings dialog is open
- visible focus is preserved for every settings control

The mute control should be reachable without pointer input. A small top-bar icon
button is fine, but it must share the same persisted state and keyboard behavior as
the settings panel.

## Integration sequence

1. Land the settings store from `PERSISTENCE_AND_SETTINGS_PLAN.md`, including
   `audio.muted` and `audio.volume`.
2. Add `src/audio/events.ts` with the `SoundEvent` union and `SoundSink` no-op.
3. Inject an optional `SoundSink` into `GameEngine`.
4. Emit events from combat, hunger/health threshold, equipment, item, stairs, and
   secret reveal paths.
5. Add unit tests using a recording sink; no browser audio needed.
6. Add `AudioService` and manifest-based asset resolution.
7. Wire `AudioService` in `main.ts`, including browser audio unlock.
8. Add settings UI controls, keyboard support, and persisted updates.
9. Add initial placeholder or generated assets under `public/audio/sfx/`.
10. Run browser verification for unlock, mute, volume, repeated combat, and overlay
    keyboard behavior.

This order keeps engine event semantics testable before any asset files exist.

## Testing strategy

Unit tests:

- event helpers map game state transitions to the right `SoundEvent`
- hunger threshold cues fire only on downward crossing
- HP threshold cues fire only on downward crossing and re-arm after recovery
- equipment diffs emit equip/unequip/rejected events correctly
- `GameEngine` still works with the default no-op sink
- settings load defaults, save mute/volume, and merge partial older settings blobs
- `AudioService` clamps volume, respects mute, applies cooldowns, and handles missing
  assets without throwing

Browser/manual verification:

- first keyboard movement unlocks audio without interrupting movement
- mute suppresses all effects immediately and persists across reload
- volume slider changes perceived loudness and persists across reload
- settings dialog is fully keyboard-operable
- game shortcuts do not leak while settings is open
- rapid combat does not stack into harsh clipping
- hunger/starvation warnings do not repeat every turn unless intentionally cooldowned

Use `npm run check` for the repo proof gate once implemented.

## First implementation slice

A strong but modest first slice:

- settings store with `audio.muted` and `audio.volume`
- `SoundSink` injection and recording-sink tests
- Web Audio service with manifest lookup, global gain, mute, cooldown, and unlock
- settings UI mute + volume controls
- initial cues for:
  - `combat.hit`
  - `combat.miss`
  - `combat.death`
  - `player.lowHealth`
  - `hunger.hungry`
  - `hunger.fatigued`
  - `hunger.starving`
  - `equipment.equipWeapon`
  - `equipment.equipArmor`
  - `equipment.unequipArmor`
  - `item.pickup`
  - `item.consume`
  - `map.stairs`
  - `map.secretReveal`

After that, add richer monster-specific, rarity-specific, boss-specific, and UI
transition variants by editing the manifest and asset set, not by adding one-off
engine calls.

## Open questions

- Should the settings surface be a dedicated modal or an existing top-bar popover?
  Recommendation: dedicated modal, because volume sliders and future keybindings need
  predictable focus management.
- Should generated assets be committed as `.webm`, `.mp3`, or both? Recommendation:
  commit `.webm` first for size, then add `.mp3` fallback only if target-browser proof
  shows a need.
- Should the service randomize variants every time, or use seeded selection for
  deterministic audio? Recommendation: randomize in the audio service with
  `Math.random()`; sounds are presentation-only and should not perturb game RNG.
