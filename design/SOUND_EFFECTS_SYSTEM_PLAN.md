# Sound Effects System — Plan

Status: **proposed** (design only — implementation deferred pending review)
Date: 2026-06-22

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
  service later, but they need different lifecycle rules — see "Background music
  (post-slice)" for that design.

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
| `combat.death` | normal monster death (payload carries monster identity, see below) |
| `combat.bossDeath` | required boss death |
| `player.levelUp` | `gainXp` returns `true` (leveled) |
| `player.lowHealth` | HP crosses the warning threshold (50%) downward |
| `player.criticalHealth` | HP crosses the critical threshold (25%) downward |
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
whether rare armor gets a different clip. The "player hit" cue from the Goal section is
not a separate event — it is `combat.hit` with `{ actor: 'monster', target: 'player' }`,
and the manifest can map that payload to a distinct clip.

## Threshold rules

Threshold sounds need stateful crossing detection so they do not chatter every turn.

Track previous vitals inside the engine or a tiny `SoundStateTracker`:

- `player.lowHealth`: play when HP crosses below 50 percent.
- `player.criticalHealth`: play when HP crosses below 25 percent.
- `hunger.hungry`: play when hunger crosses below `BALANCE.player.hungerHungry` (425).
- `hunger.fatigued`: play when hunger crosses below `BALANCE.player.hungerFatigued` (190).
- `hunger.starving`: play once when hunger first reaches 0.
- `hunger.starveTick`: play at most once every N turns while starvation damage
  continues.

Reset threshold gates when the value recovers above a hysteresis boundary:

- HP warning can re-arm above 60 percent; critical can re-arm above 35 percent.
- hunger warning can re-arm above its threshold plus a small buffer, usually after
  eating.

This lets eating, healing, and Vigor make future warnings meaningful without creating
constant beeps during ordinary turn processing.

Note: the hunger tiers (Satiated/Hungry/Fatigued/Starving) are already computed by
`hungerView` in `src/ui/format.ts` using strict `<` against `hungerFatigued`/`hungerHungry`.
The `SoundStateTracker` should derive crossings from the same `BALANCE.player` numbers
(or the same status string) rather than redefining thresholds, so audio and the HUD never
disagree about when the player is "Hungry."

## Equipment detection

Current equip paths are (verified against `src/engine.ts` / `src/player.ts`):

- `GameEngine.equipGear(slot, value)` for equipment popovers → calls `handleEquipItem`
- `GameEngine.equipInventoryItem(ref)` for inventory actions → returns `boolean`
- `GameEngine.performInventoryAction(ref, 'equipOffHand')` for explicit off-hand weapon equip
- `handleEquipItem` and `performInventoryAction` both funnel into `equipValidated` in
  `src/player.ts`, which is the single shared validation/mutation point and returns a
  `boolean` success flag.

Do not put audio in `src/player.ts`; it should stay pure validation/mutation logic.
Because every path funnels through `equipValidated`, do the diffing in the three
`GameEngine` command methods rather than threading sound through the shared mutator —
capture the equipped snapshot before and after the engine command:

```ts
// inside e.g. GameEngine.equipInventoryItem
const before = snapshotEquipped(this.player);
const equipped = this.equipInventoryItemInner(ref); // returns boolean from equipValidated
emitEquipmentSounds(before, snapshotEquipped(this.player), equipped);
```

Caveat: `equipGear` currently discards the `boolean` that `handleEquipItem` returns, so
emitting `equipment.rejected` from that path needs that return value captured first.

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
  // Added with the music section, not the first slice:
  // musicMuted?: boolean;
  // musicVolume?: number; // 0..1, default ~0.4
}
```

Settings loading must merge partial/older blobs (see Testing strategy), so adding the
music fields later is backward-compatible: absent fields fall back to defaults.

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

## Monster and archetype sounds

The game should be able to give individual monsters their own combat cues (a
Leprechaun's death chuckle, a dragon's roar) without adding a per-monster `emit` call
or a new event name for every creature. The engine model already provides a clean
identity cascade to key off of — reuse it instead of inventing a parallel taxonomy:

- `monster.id` — stable discovery key carried from the template at spawn; falls back to
  a slug of `monster.name` (see `src/types.ts` and `monsterId()` in
  `src/ai/archetypes.ts`).
- archetype — `archetypeOf(template)` in `src/ai/archetypes.ts` resolves a monster to
  `default | brute | kiter | trickster | ambusher | …`. This lets a whole behavioral
  family share a cue (every trickster gets the same flee sting) for free.
- `special?: 'hero' | 'boss'` on the template/monster — drives `combat.bossDeath` and
  can gate boss-only stingers.

Keep combat events generic and put identity in the **payload**, not the event name:

```ts
sound.emit({
  type: 'combat.death',
  monsterId: monster.id ?? slug(monster.name),
  archetype: archetypeOf(monster),   // pure helper, safe to import into audio
  special: monster.special,          // 'hero' | 'boss' | undefined
});
```

The audio layer resolves the clip with a **most-specific-wins cascade**, so most
monsters fall through to a shared default and only the ones worth authoring need an
entry:

```
monsterId match  →  archetype match  →  special match  →  generic event clip
'leprechaun'        'trickster'         'boss'             'combat.death'
```

Express this as a small resolution table the manifest owns, rather than overloading
every `SoundAsset` with match keys:

```ts
export interface SoundResolution {
  event: SoundEventType;          // e.g. 'combat.death'
  byMonsterId?: Record<string, string>;   // monsterId   -> assetId
  byArchetype?: Record<string, string>;   // archetypeId -> assetId
  bySpecial?: Record<'hero' | 'boss', string>;
  default: string;                // assetId, always present
}
```

Rules and guardrails:

- A missing override is never an error — resolution just falls to the next tier, and an
  unknown `monsterId` is silently fine. This keeps adding monsters from breaking audio.
- Per-monster sounds are **additive presentation only**. They must not change the event
  taxonomy, combat math, or game RNG, and the visual/log feedback stays identical
  (consistent with the non-goals).
- Boss/hero cues should still go through `combat.bossDeath`/a `special` tier so they can
  be louder, longer, and exempt from the normal death-cue cooldown.
- Start with archetype-level coverage (a handful of clips covers every monster), then
  add per-`monsterId` clips only for signature creatures and bosses. This is a
  manifest+asset edit, never an engine change.

## Background music (post-slice)

Background music is explicitly out of the first slice (see Non-goals), but the service
should be designed so it can host music later without a redesign. Target: **about five
looping tracks, each roughly three minutes**, selected by context (e.g. early floors,
deep floors, boss encounter, town/safe, game-over) and crossfaded on transition.

Important: this uses a **different ElevenLabs API than the sound effects above**.
Sound effects come from the text-to-sound-effects endpoint (max ~30s); ~3-minute music
must be produced with the ElevenLabs **Music API** (the `music` skill / `compose`
endpoint, which supports multi-minute durations). Like SFX, it stays an
asset-production step — runtime code only ever loads local files.

Design notes that differ from one-shot SFX:

- **Separate channel and gain.** Add a `music` channel with its own gain node and its
  own settings (`settings.audio.musicMuted`, `settings.audio.musicVolume`), independent
  of the SFX volume, so players can silence music but keep combat cues.
- **Single-voice lifecycle.** At most one track plays at a time. Track changes
  crossfade (e.g. 1–2s) rather than hard-cut; never stack two music loops.
- **Seamless looping.** Generate with looping enabled and verify the loop point; a
  3-minute bed that clicks on repeat is worse than silence.
- **Context selection, not per-turn churn.** Music switches on coarse state changes
  (floor depth band, entering a boss room, run end), debounced so rapid floor changes
  don't thrash tracks. This is the "different lifecycle rules" the non-goals allude to.
- **Streaming/lazy load.** A ~3-minute track is large; stream or lazy-load it after
  unlock and after the core SFX are ready, so music never delays gameplay or first SFX.
- **Format.** Music benefits more from `opus`/`webm` than tiny SFX do; revisit the
  SFX format question (below) jointly for music, where size matters most.

Suggested asset layout and a starting track set (final prompts live in the asset doc):

```
public/audio/music/
  explore-shallow-01.webm   ~3:00 loop  — calm dungeon exploration, floors 1–3
  explore-deep-01.webm      ~3:00 loop  — tense deeper dungeon, floors 4+
  boss-01.webm              ~3:00 loop  — driving boss-encounter theme
  safe-01.webm              ~3:00 loop  — warm respite/town theme
  gameover-01.webm          ~3:00 loop  — somber game-over / victory bed
```

These five map to the contexts above; add or split tracks by editing the manifest and
the music-selection rule, not the engine.

## Settings UI

Add sound controls to a settings surface. If the persistence/settings plan has not
landed yet, implement the reusable settings store first, then add the UI.

Required controls:

- global mute toggle
- volume slider, range `0..100`, stored as `0..1`
- optional "test sound" button
- (added with the music section) a separate music mute toggle and music volume slider,
  so music and SFX are independently controllable

Keyboard-first requirements from `AGENTS.md`. Reuse the existing `KeyboardManager`
(`src/keyboard.ts`) rather than adding a parallel listener — it already supports
per-context bindings (`'game'`, `'modal'`, `'global'`), `setContextActive(context,
active)`, and `suspend()`. Follow the existing modal pattern (the `'i'`/`'m'` overlays
in `src/main.ts` and `overlayOpen()`): when settings opens, deactivate the `'game'`
context so movement/search/eat keys stop firing, and register settings controls under a
dedicated context.

- settings open/close shortcut: `,` and `?` are both currently free (taken keys: WASD +
  arrows, `e`, space, `r`, `i`, `m`, Ctrl+B). Reserve `?` for a future help screen and
  prefer `,` (or `o` for "options") for settings — see open question below.
- register a `'settings'`/`'modal'` context and call `setContextActive('game', false)`
  while open, mirroring the existing overlay handling
- Tab/Shift+Tab moves through controls predictably
- arrow keys adjust the volume slider
- Return/Space toggles mute and activates the test sound button
- Escape closes settings and restores focus to the game canvas or the button that
  opened settings
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
- Which key opens settings? `,` and `?` are both free today. Recommendation: `,`
  (reserve `?` for a help screen). Needs a final controls-map decision.
- Should `player.criticalHealth` ship in the first slice, or only `player.lowHealth`?
  The first-slice list currently includes only `lowHealth`; the taxonomy and threshold
  rules now define both. Recommendation: ship both — the second threshold is a payload/
  gate variant, not meaningfully more engine work.
