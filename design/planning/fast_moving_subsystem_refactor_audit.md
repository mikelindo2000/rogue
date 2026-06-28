# Fast-Moving Subsystem Refactor Audit

Date: 2026-06-28
Status: planning audit

## Why This Exists

Recent work moved fast across presentation effects, the GameEngine/UI boundary,
armor and weapon handling, inventory actions, sound, music, asset readiness, and
debug tooling. The code is still broadly coherent and well tested, but a few
transitional seams are starting to collect extra responsibility.

This document records the smells worth watching and the refactors that would
make the next wave of feature work cheaper. It is intentionally not an
implementation order for every item below; it is a map of the pressure points.

## Summary

The best near-term refactor is to finish the presentation split that has already
started. The current architecture has real improvements: immutable map
snapshots, typed presentation events, `ChromePresenter`, `MapViewController`,
and `AsciiCanvasRenderer`. The smell is that the old and new contracts now
coexist, so new work often has two valid places to wire through.

The second strongest candidate is a small command/turn transaction helper in
`GameEngine`. Food, equip, inventory actions, drop, potions, scrolls, wands,
sleep, stun, UI publication, autosave, and sound all repeat small pieces of the
same choreography. That repetition is already producing guard comments like
"route it before the shared takeSleepTurn below to avoid double-ticking."

The third candidate is to split the largest projection/rendering classes by
responsibility. `ChromePresenter` is now stats projector, visual-effect
composer, inventory view builder, overlay placer, log projector, and end-run
publisher. `AsciiCanvasRenderer` is now canvas painter, board animation store,
rAF participant, map-plane host, floor-transition host, and death-transition
host. Neither is broken, but both are where future changes will pay the most
coordination tax.

## Findings

### 1. Presentation split is half migrated

Evidence:

- `src/presentation/presenter.ts` documents a clean ownership boundary: engine
  publishes snapshots/events, renderers draw immutable snapshots, chrome lives
  in `ChromePresenter`, and keyboard commands stay outside presentation.
- The same `GamePresenter` interface still exposes legacy methods such as
  `updateStats`, `updateDropdowns`, `showItemPickup`, `resetLog`, `renderLogs`,
  and `syncDiscovery`.
- `src/presentation/gameUiPresenter.ts` maps the new `publish*` methods right
  back into old `GameUI` method names, and still exposes `fx*` passthroughs for
  every effect.

Smell:

There are two presentation APIs: the typed snapshot/event API and the legacy
adapter API. This makes each new effect or overlay ask, "publish an event, call
a direct method, or both?"

Refactor candidate:

- Narrow `GamePresenter` to only `setMode`, `publishStats`,
  `publishInventory`, `publishMap`, `publishLogs`, `publishDiscovery`, and
  `publishEvent`.
- Move item-pickup and end-run chrome state behind typed snapshots/events.
- Keep `GameUiPresenterAdapter` as a temporary browser adapter, but stop adding
  new public passthroughs to it.

Suggested first slice:

Replace direct `presenter.updateDropdowns(player)` calls with
`presenter.publishInventory({ player })`, then remove `updateDropdowns` from the
interface once callers are migrated.

### 2. GameEngine command paths repeat turn gating and publication

Evidence:

- `consumeFood`, `equipGear`, `equipInventoryItem`, `useInventoryItem`,
  `performInventoryAction`, and `dropInventoryRef` each perform their own
  `takeSleepTurn` / `takeStunTurn` checks.
- Several paths manually choose some combination of `presenter.updateDropdowns`,
  `updateUI`, `processTurn`, and `autosave`.
- `performInventoryAction` has a special drop-first route to avoid
  double-ticking sleep.
- Dropping gear must manually adjust index-based equipment references after
  splicing weapon, armor, or shield arrays.

Smell:

Game rules are correct today, but correctness depends on every command method
remembering the same sequence. That is fragile as more commands land: rings,
identification, curses, dipping, targeting, item throw/drop variants, and new
debug controls will all want the same choreography.

Refactor candidate:

Introduce a small command executor, not a framework:

```ts
type CommandResult =
  | { kind: 'no-turn' }
  | { kind: 'spent-turn'; inventory?: boolean; stats?: boolean }
  | { kind: 'invalid'; refreshInventory?: boolean };
```

The helper should own:

- game-over / game-won / aiming guards when requested,
- sleep and stun turn gates,
- whether the command spends a turn,
- post-command inventory/stat publication,
- autosave scheduling,
- common rejection logging patterns.

Keep actual gameplay logic in the current methods at first. The first useful
slice is not "rewrite the engine"; it is "make command methods declare their
turn/publication outcome."

### 3. ChromePresenter is doing too many kinds of projection

Evidence:

- `publishStats` writes top-bar fields, hunger fields, survival warning fields,
  visual-effect layers, disorientation intensity, XP, and food.
- `publishMap` handles boss encounter UI, boss visual effects, boss map sway,
  stairs-nearby, nearby monster, combat portrait, item-pickup overlay, game
  over/won flags, and overlay placement.
- `buildInventory` creates every inventory cell type and action list.
- `syncOverlaysFromSnapshot` reconstructs partial `Monster` and `Item` objects
  from `MonsterView` and `ItemView`, which partially undoes the snapshot
  boundary.

Smell:

The class is an effective adapter, but it is becoming the second "god object"
after the old `GameUI`. A change to a wand inventory action, a boss overlay, and
an item pickup corner can all require editing the same file.

Refactor candidate:

Split pure projection helpers into modules first, then consider a thinner class:

- `src/presentation/chrome/statsProjection.ts`
- `src/presentation/chrome/inventoryProjection.ts`
- `src/presentation/chrome/overlayProjection.ts`
- `src/presentation/chrome/logProjection.ts`
- `src/presentation/chrome/effectsProjection.ts`

The important boundary: overlay projection should consume `MapSnapshot` views
directly instead of reconstructing engine `Monster` / `Item` shapes.

### 4. AsciiCanvasRenderer is several subsystems in one file

Evidence:

- The class owns snapshot ingestion, movement animation state, combat FX state,
  reduced-motion propagation, tile-size calculation, viewport panning, map-plane
  effects, floor transitions, death transitions, the render loop, tile drawing,
  glyph drawing, player drawing, trap drawing, telegraph drawing, and effect
  drawing.
- `paint()` is the central method where transform controllers, canvas sizing,
  terrain, items, traps, telegraphs, detected monsters, monsters, death FX,
  player trails, damage numbers, swoops, whiffs, and float labels all converge.
- The renderer accepts an injected `random` option for transition selection and
  map-stage effects, but damage-number jitter and float-label jitter still use
  `Math.random()`.

Smell:

The renderer has remained stable because tests cover its lifecycle and helpers,
but it is the place where every board visual change accumulates. Adding another
three board-anchored effects will be tempting but will make the file harder to
reason about.

Refactor candidate:

- Extract `BoardPainter` for terrain, traps, items, monsters, and player draw.
- Extract `BoardFxController` for `Fx`, `FX_LIFE`, `playerRunAnim`,
  `dodgeAnim`, `moveAnim`, and `isAnimating` contributions.
- Keep `AsciiCanvasRenderer` as the host that wires canvas, controllers, and
  `MapRenderer`.
- Route all renderer randomness through the injected `random` option so tests
  and proof helpers can make FX deterministic.

### 5. Inventory and equipment identity is index based

Evidence:

- `InventoryRef` for weapons, armor, shields, and wands points at array indices.
- Off-hand equipment stores strings such as `weapon:2` or `shield:1`.
- Dropping gear splices arrays and then calls `adjustWeaponIndices`,
  `adjustArmorIndices`, or `adjustShieldIndices`.

Smell:

Index references are workable for today's inventory, but the planned item
systems will make them more expensive. Rings, curses, identification, coatings,
targeting, and multiple item pickers all benefit from stable carried-item
identity.

Refactor candidate:

Plan a save-versioned item identity migration before the next large inventory
expansion:

- give carried gear and wands stable `id` values,
- represent equipped slots by id instead of array index,
- keep array order for display only,
- keep stackable consumables by type/count for now unless targeting individual
  consumables becomes necessary.

This is not urgent enough to block small features, but it is worth doing before
several more item systems build on `InventoryRef`.

### 6. Status timers are split across three models

Evidence:

- `StatusEffects` holds buff-ish timers such as Vigor, Midas, Strength,
  Invisibility, Armor, and Monster Detection.
- `TrapEffects` holds sleep, confusion, bear trap, and strength drain.
- `Player.activeEffects` holds monster-inflicted effects such as DoT, stun,
  miss chance, fear, weapon debuff, armor debuff, attack debuff, and silence.
- `processTurn()` decrements `StatusEffects` inline, then calls
  `tickPlayerEffects`, then applies hunger, regeneration, wand cooldowns, and
  monster turns.

Smell:

The split is understandable historically, but future effects need to answer
several questions before they can be added: Which timer bucket owns it? Which
read site applies it? Does it tick on helpless turns? Does it spend a command?
Which log line expires it?

Documentation drift:

The `EffectKind` comment in `src/types.ts` still says only `dot` is wired today,
but the code and changelog show the other effect kinds are now implemented.

Refactor candidate:

Create a small "turn effects" module that documents and owns timer policy:

- tick order,
- expiry logging,
- passive read-site helpers,
- helpless-turn behavior,
- whether a timer is a buff, trap effect, or monster-inflicted player effect.

This can start as documentation plus tests around current behavior before any
data model changes.

### 7. Audio runtime boundary is mostly good, with two growth smells

Evidence:

- The engine emits typed `SoundEvent`s and the manifest resolves them to local
  assets, which is the right boundary.
- The audio service imports the Svelte `ui` store directly to publish debug
  sound messages.
- `SoundAsset.channel` and `SoundAsset.priority` are explicitly documented as
  reserved / not honored by runtime mixing.
- `preload` defaults to true after unlock, except the per-monster death cascade.

Smell:

The asset/event boundary is clean, but the runtime service is now both audio
playback and UI debug logger. Also, the manifest exposes mixing concepts that
look real to callers but do not affect runtime behavior yet.

Refactor candidate:

- Inject an optional `SoundDebugSink` into `AudioService` instead of importing
  `ui` directly.
- Either implement channel/priority semantics or move them under a clearly named
  future field until there is runtime behavior.
- Add an audio preload budget audit that reports eager clip count and total bytes
  after unlock, so default-preload remains a conscious tradeoff as assets grow.

### 8. Main action wiring and modal state are becoming a router

Evidence:

- `main.ts` wires every `actions.*` callback, keyboard context updates, audio
  unlocks, save flushing, end-run publication, music context, settings
  persistence, dev helpers, inventory opening, scroll chooser behavior, and wand
  aiming context.
- `overlayOpen()` currently inspects DOM roles (`[role="menu"], [role="dialog"]`)
  to suppress movement.

Smell:

This has worked well as a bootstrap file, but it is now a router, service
container, modal coordinator, autosave coordinator, audio unlock handler, and
keyboard binding table in one place.

Refactor candidate:

- Extract an `ActionController` that wires `UIActions` to the engine and
  presenter.
- Extract a `ModalState` / overlay registry selector from the Svelte store so
  movement suppression depends on explicit app state, not DOM role queries.
- Keep `main.ts` as setup and composition.

### 9. Documentation drift has started

Found drift:

- `design/planning/game_ui_split_plan.md` still describes the pre-split current
  situation, while much of the plan has shipped.
- `design/implemented/sound_effects_system_plan.md` is in `implemented/`, but
  its header still says "proposed" and "implementation deferred pending review."
- `src/types.ts` says only `dot` is wired in the monster-inflicted effect spine.
- `src/ui/devTools.ts` still has a TODO about threading engine/ui into
  `DebugPanel`, while boss and level-up engine/UI-backed controls are already
  wired through explicit callback seams.

Refactor candidate:

Do a documentation maintenance pass before the next subsystem plan:

- mark the UI split plan as partially shipped and move completed parts to
  `design/implemented/` or split the remaining work into a smaller active plan,
- fix the sound plan status header,
- update the `EffectKind` and dev-tools comments,
- add a short "current architecture" doc for presentation, effects, audio, and
  inventory identity so future plans do not have to rediscover it.

## Priority Order

1. **P1: Finish the presenter API narrowing.** Smallest high-leverage cleanup,
   and it prevents future effects from choosing the wrong path.
2. **P1: Add command/turn transaction helpers.** Do this before rings,
   identification, curses, or more item actions.
3. **P2: Split ChromePresenter projection helpers.** Start with inventory and
   overlays; they are the largest and most domain-heavy.
4. **P2: Extract board FX from AsciiCanvasRenderer.** Do before adding more
   tile-anchored animation families.
5. **P2: Documentation drift pass.** Cheap, useful, and reduces onboarding tax.
6. **P3: Stable carried-item IDs.** Higher blast radius; schedule before the
   next big inventory-system expansion rather than as drive-by cleanup.
7. **P3: Audio debug/mixer cleanup.** Valuable, but less urgent while asset
   counts are still manageable.

## Things That Look Fine

- The engine is not coupled to ElevenLabs or browser audio APIs.
- The sound event manifest and audit samples are a good direction.
- The dev panel registry is the right place for manual test hooks.
- The map-plane/effect-layer split is documented and conceptually clean.
- Keyboard-first expectations are reflected in the inventory modal and keyboard
  manager, though action routing should be simplified before it grows further.
- Most fast-moving seams have dedicated tests; this audit is about reducing
  future coupling, not repairing an untested codebase.

## Suggested First Implementation Plan

1. Replace `GamePresenter.updateStats` and `updateDropdowns` callers with
   `publishStats` / `publishInventory`.
2. Add a focused regression test that `GameEngine` can drive a minimal presenter
   using only `publish*` methods.
3. Extract `inventoryProjection.ts` from `ChromePresenter.buildInventory` and
   keep tests at the projection level.
4. Introduce a tiny `runCommand` helper for sleep/stun/turn-spend/update
   choreography and migrate one low-risk command, probably food or scroll read.
5. Fix the documentation drift listed above while the architecture is fresh.

## Verification For Future Refactors

For any implementation slice derived from this audit:

- run `npm run check`,
- include keyboard behavior in manual or automated verification if a UI command
  path changes,
- keep audio visual/log feedback intact when touching sound,
- keep save migrations explicit if carried-item identity changes,
- use the Debug panel for new manual hooks rather than adding scattered buttons
  or console-only helpers.
