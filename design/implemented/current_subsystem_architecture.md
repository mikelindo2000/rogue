# Current Subsystem Architecture

Date: 2026-06-28
Status: implemented reference

This note captures the shipped seams that recent fast-moving work now depends
on. It is intentionally short; use the linked implementation files as source of
truth for exact behavior.

## Presentation

`GameEngine` talks to `GamePresenter` (`src/presentation/presenter.ts`) instead
of to browser UI classes. The engine publishes HUD, inventory, map, log,
discovery, and typed presentation-event data. The browser adapter
(`src/presentation/gameUiPresenter.ts`) still forwards some events into the
current `GameUI` compatibility facade, while `ChromePresenter` projects Svelte
store state and `MapViewController`/`AsciiCanvasRenderer` own the map canvas.

New presentation work should prefer typed snapshots/events or focused projection
helpers. Avoid adding new engine calls to legacy `GameUI` method shapes unless
there is a migration note explaining why.

## Effects

Player timers currently live in three historical buckets:

- `StatusEffects` for buff-like effects such as Vigor, Midas, Strength,
  Invisibility, Armor, and Monster Detection.
- `TrapEffects` for trap-origin timers such as sleep, confusion, bear trap, and
  strength drain.
- `Player.activeEffects` for monster-inflicted effects such as DoT, stun,
  miss chance, fear, weapon debuff, armor debuff, attack debuff, and magic
  silence.

`src/effects.ts` owns the active-effect lifecycle. `GameEngine.processTurn()`
owns turn order and calls into that lifecycle while preserving the older status
and trap timers. Future effect refactors should document tick order, helpless
turn behavior, expiry logging, and read-site ownership before changing data
shape.

## Audio

The engine emits typed `SoundEvent`s through a `SoundSink`
(`src/audio/events.ts`). Runtime audio resolution, playback, preload policy,
settings, and debug display live in the audio/UI layer, not in `GameEngine`.
Assets are local files under `public/audio/` and are indexed by the manifest;
ElevenLabs generation remains an offline asset-production step documented in
`design/implemented/sound_effect_asset_prompts.md`.

Sound is additive feedback. Gameplay-visible/log feedback must remain intact
when a cue is added or changed.

## Inventory Identity

Carried weapons, armor, shields, and wands are still referenced by inventory
array index (`InventoryRef`). Off-hand equipment stores typed index strings such
as `weapon:2` and `shield:1`; dropping gear adjusts affected indices after
splicing. Stackable consumables remain type/count based.

This is stable for current gameplay, but planned accessory, curse,
identification, coating, and targeting systems should use a save-versioned
stable carried-item-id migration rather than adding more index-sensitive paths.
