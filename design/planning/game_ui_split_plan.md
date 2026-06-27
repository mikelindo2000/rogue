# Game UI Split Plan

## Current Situation

`GameEngine` currently depends on the concrete `GameUI` class and sends live
engine objects directly into it:

- `GameEngine` stores `private ui: GameUI` and calls presentation methods
  throughout gameplay.
- `GameEngine.draw()` passes `map`, `explored`, `visible`, `player`,
  `monsters`, `items`, and `traps` directly to `GameUI.render()`.
- `GameUI` owns the canvas, map sizing, animation loop, board rendering, combat
  effects, map-plane effects, Svelte store projection, inventory view building,
  logs, discovery sync, and board-derived overlays.

That works while there is exactly one browser presentation, but it makes the
engine and the current map renderer harder to evolve independently. The current
map already has a useful physical boundary in `CenterStage.svelte`:
`.map-viewport > .map-transition > .map-plane > canvas#gameCanvas`. The missing
boundary is the TypeScript contract between gameplay state, chrome state, and
map rendering.

## Goals

- Make `GameEngine` depend on a small presentation interface instead of the
  concrete `GameUI` implementation.
- Split Svelte chrome projection from board/map rendering.
- Introduce an immutable, presentation-oriented map snapshot so renderers do not
  receive mutable engine internals.
- Convert one-off `ui.fx*()` calls into typed presentation events.
- Support explicit presentation modes so special encounters can use a scoped
  map presentation without changing gameplay ownership.
- Keep the current canvas map as the only implemented renderer in this plan.
- Preserve all current behavior, visuals, keyboard handling, autosave timing,
  audio events, and savegame shape.
- Keep the migration incremental so each phase can be reviewed and tested
  without a large visual rewrite.

## Non-Goals

- Do not implement new map view styles in this plan.
- Do not change map generation, FOV, monster AI, combat, inventory rules, or
  savegame semantics.
- Do not move gameplay decisions into Svelte components or renderer classes.
- Do not replace the current canvas drawing code with a different graphics
  technology.
- Do not add a user-facing renderer switcher until the current renderer has been
  extracted behind a stable contract.

## Proposed Boundaries

### `GamePresenter`

Create a narrow engine-facing port. The engine calls this port after gameplay
state changes; concrete UI adapters handle store updates, renderer updates, and
animations.

```ts
// src/presentation/presenter.ts
export interface GamePresenter {
  setMode(mode: PresentationMode): void;
  publishStats(snapshot: HudSnapshot): void;
  publishInventory(snapshot: InventorySnapshot): void;
  publishMap(snapshot: MapSnapshot): void;
  publishLogs(logs: readonly string[]): void;
  publishDiscovery(snapshot: DiscoverySnapshot): void;
  publishEvent(event: PresentationEvent): void;
}
```

Keep the first implementation as an adapter over the existing `GameUI`, then
move responsibilities out from behind that adapter phase by phase. This avoids a
flag-day change to the engine.

#### One synchronous query to resolve

`GamePresenter` is a one-way port: the engine publishes and commands, never
reads back. There is exactly one call in `engine.ts` that violates this today —
`this.ui.getStyledItemName(name, rarity)`, used twice to build HTML-styled item
names for log lines. It is a presentation concern (it emits a `<span>` with a
rarity color via `rarityVar`/`escapeHtml`) that the engine currently pulls
synchronously.

Do not add a `getStyledItemName` method to the port. Instead, during migration
either:

- move the styling to the chrome/log layer — the engine logs a structured item
  reference (name + rarity) and `ChromePresenter` styles it at render time, or
- extract the formatter into a pure presentation util the engine imports
  directly, with no `GameUI` instance dependency.

The first option is cleaner long-term (the engine emits no HTML); the second is
a smaller mechanical change. Either keeps the port one-way.

### `PresentationMode`

Model presentation mode as first-class UI state instead of as scattered Svelte
conditionals. The initial mode is the normal dungeon map. Additional modes are
allowed to choose a different renderer or scoped map framing, but they do not
change gameplay rules by themselves.

```ts
export type PresentationMode =
  | { type: 'dungeon-map' }
  | { type: 'boss-encounter'; bossKey: string; scope: EncounterScope }
  | { type: 'end-run-transition'; runId: string };

export interface EncounterScope {
  kind: 'room';
  rect: { l: number; t: number; r: number; b: number };
  entryDir?: 'up' | 'down' | 'left' | 'right';
}
```

The presenter owns mode selection and renderer handoff. The engine may publish
that a boss encounter is active, but the mode object remains presentation data:
it says how to frame the current state, not how combat or movement works.

### `MapSnapshot`

Add a rendering-oriented snapshot assembled by the engine or a dedicated mapper.
It should be plain data and deeply immutable from the renderer's point of view.

```ts
// src/presentation/mapSnapshot.ts
export interface MapSnapshot {
  cols: number;
  rows: number;
  floor: number;
  scope: MapSnapshotScope;
  gameOver: boolean;
  gameWon: boolean;
  monsterDetectionActive: boolean;
  tiles: readonly (readonly MapTileView[])[];
  player: PlayerView;
  monsters: readonly MonsterView[];
  items: readonly ItemView[];
  traps: readonly TrapView[];
}

export interface MapTileView {
  x: number;
  y: number;
  kind: string;
  explored: boolean;
  visible: boolean;
}

export type MapSnapshotScope =
  | { type: 'full-floor' }
  | { type: 'room'; rect: { l: number; t: number; r: number; b: number } };
```

The initial version can keep `kind` aligned with the existing `TILE` vocabulary.
The important change is ownership: renderers consume a snapshot; they do not hold
references to `Player`, `Monster`, or `Item` objects.

A scoped snapshot still comes from the full engine state. For a room-scoped
encounter presentation, the mapper filters or annotates tiles/entities to the
current room bounds while preserving the same player, monster, item, trap, and
visibility semantics.

### `PresentationEvent`

Replace direct effect methods with typed events. The first event set should map
one-to-one to current `GameUI` effect calls so behavior stays identical.

```ts
export type PresentationEvent =
  | { type: 'combat.strike'; fromX: number; fromY: number; toX: number; toY: number }
  | { type: 'combat.hit'; x: number; y: number; damage: number; crit: boolean }
  | { type: 'combat.freeze'; x: number; y: number }
  | { type: 'combat.death'; x: number; y: number; glyph: string; color: string }
  | { type: 'combat.playerHit' }
  | { type: 'combat.dive'; fromX: number; fromY: number; toX: number; toY: number; color: string }
  | { type: 'combat.whiff'; x: number; y: number }
  | { type: 'combat.monsterDodge'; monsterKey: string; fromX: number; fromY: number }
  | { type: 'map.rumble'; strength: number }
  | { type: 'map.floorTransition'; dir: 'down' | 'up' }
  | { type: 'presentation.modeChanged'; mode: PresentationMode }
  | { type: 'player.run'; path: readonly RunPathStep[]; ghosts: readonly RunGhostItem[] }
  | { type: 'aiming.changed'; wandName: string | null };
```

Events should carry stable identifiers instead of object references. For monster
events, add a render key in the snapshot mapper. The first version can derive it
from floor plus spawn order if no persistent runtime id exists yet.

### `MapRenderer`

Extract the board canvas work from `GameUI` into a renderer interface.

```ts
export interface MapRenderer {
  mount(host: HTMLElement): void;
  setSnapshot(snapshot: MapSnapshot): void;
  dispatch(event: PresentationEvent): void;
  resize(bounds: DOMRectReadOnly): void;
  tick(now: number): boolean;
  destroy(): void;
}
```

`tick()` returns whether the renderer still has active animations. A
`MapViewController` owns requestAnimationFrame scheduling and forwards snapshots,
events, resize observations, and reduced-motion settings to the active renderer.

`MapViewController` also owns renderer handoff on presentation-mode changes. A
mode may keep the same renderer and only alter scope/framing, or it may mount a
different renderer behind the same `MapRenderer` contract. Handoff must be
explicit so resize, animation cancellation, focus, reduced-motion behavior, and
death/floor transitions stay predictable.

### `ChromePresenter`

Move Svelte store projection out of the map renderer. The chrome side should own:

- top-bar and vitals fields,
- equipment, inventory, potion, and action views,
- logs,
- discovery snapshots,
- end-run summary state,
- board-derived Svelte overlays such as stairs-nearby and nearby-monster.

Some board-derived overlays currently live inside `GameUI.render()`. Keep them
in chrome/presentation helpers, not inside the renderer. The renderer should draw
the map; chrome should decide which Svelte overlays to show.

## Boss Encounter Presentation Mode

A boss encounter view is a presentation mode, not a separate game. It should be
able to show only the current room or arena context while still consuming normal
engine snapshots and events.

For this plan, "boss encounter" means:

- gameplay remains turn/grid based and authoritative in `GameEngine`,
- keyboard actions still route through the existing action wiring,
- the map snapshot may be scoped to the room that contains the player and boss,
- the active renderer may frame that scoped room differently,
- Svelte chrome can hide, dim, or rearrange nonessential overlays through the
  current `PresentationMode`,
- entry and exit are driven by explicit mode-change events.

The mode must not infer combat state by inspecting renderer internals. A future
boss system should publish enough state for the presenter to derive:

- `bossKey`: stable render key of the focused boss,
- `scope`: room bounds or arena bounds,
- `phase`: optional display-only boss phase label/state,
- `entryReason`: encounter start, phase transition, or return to dungeon map.

If a future boss battle changes gameplay rules, timing, movement, targeting, or
camera orientation as part of combat, that is engine work and should be planned
separately. This plan only covers how the presentation layer can frame the same
authoritative game state differently.

## Target Module Shape

```text
src/
  presentation/
    presenter.ts              # GamePresenter and concrete browser presenter
    mapSnapshot.ts            # engine -> map snapshot mapper
    presentationEvents.ts     # typed visual/presentation events
    chromePresenter.ts        # Svelte store projection
    mapViewController.ts      # renderer lifecycle + rAF + resize
    renderers/
      asciiCanvasRenderer.ts  # current canvas renderer, moved from GameUI
  ui.ts                       # temporary compatibility facade, shrinks over time
```

This directory name keeps the boundary distinct from `src/ui/`, which currently
contains Svelte-facing components and display helpers.

## Migration Plan

### Phase 1: Define Contracts and Compatibility Adapter

- Add `GamePresenter`, `MapSnapshot`, snapshot view types, and
  `PresentationEvent`.
- Add an adapter that implements `GamePresenter` by delegating to the existing
  `GameUI` methods.
- Change `GameEngine` constructor to accept `GamePresenter`.
- Keep `GameUI` intact internally.
- Update engine tests to mock `GamePresenter` rather than a partial `GameUI`.

This phase should produce no visual changes.

### Phase 2: Introduce Snapshot Mapping

- Replace the long `GameUI.render(...)` call shape with `publishMap(snapshot)`.
- Build `MapSnapshot` from engine state in one mapper function.
- Include `MapSnapshot.scope` with `full-floor` as the default.
- Deep-copy arrays and entity views enough that renderer animation cannot mutate
  engine state. Note today's `render()` already snapshots into `this.scene`, but
  that snapshot holds the *same* `Player`/`Monster`/`Item` references the engine
  mutates; the new `MapSnapshot` must break that aliasing, not preserve it.
- Preserve current tile vocabulary and current visibility/explored behavior.
- Keep the compatibility adapter translating the snapshot back into current
  `GameUI.render()` until the renderer is extracted.

This phase locks down the engine-to-map data contract.

### Phase 3: Convert Effect Calls to Events

- Replace calls such as `ui.fxHit()`, `ui.fxDeath()`, `ui.mapRumble()`, and
  `ui.beginFloorTransition()` with `publishEvent(...)`.
- Keep a one-to-one event translation in the adapter.
- Add `presentation.modeChanged` events, initially emitted only for existing
  run/end transition flows or tests.
- Remove direct mutation of presentation fields such as
  `ui.combatFocusMonster`; represent focus as event/snapshot data instead.
- Add tests that key gameplay paths emit the expected presentation events.

This phase decouples gameplay timing from a specific renderer API.

### Phase 4: Add Presentation Mode and Scoped Snapshot Support

- Add `PresentationMode` state to the browser presenter.
- Keep `dungeon-map` as the only normal mode used by gameplay.
- Add snapshot-mapper support for `full-floor` and `room` scopes.
- Add helper tests for deriving the current room scope from known room bounds,
  player position, and boss position.
- Ensure `ChromePresenter` can consume mode state for overlays without changing
  component behavior yet.

This phase prepares special encounter framing without shipping a new encounter
renderer.

### Phase 5: Extract Current Canvas Renderer

- Move `Scene`, tile drawing, glyph drawing calls, combat animation state,
  movement glides, player run animation, map-plane controllers, floor
  transitions, and death transition hooks out of `GameUI` into
  `AsciiCanvasRenderer`.
- Keep drawing output identical at rest.
- Keep `MapStageController`, `FloorTransitionController`, and
  `DeathTransitionController` as renderer-owned collaborators.
- Have `GameUI` or the new browser presenter create `MapViewController` with the
  current renderer.

This phase is the main mechanical split.

### Phase 6: Extract Chrome Presenter

- Move `updateStats()`, `updateDropdowns()`, `renderLogs()`, `syncDiscovery()`,
  inventory view construction, and board-derived overlay projection
  (`syncOverlays` → `ui.stairsNearby` / `ui.nearbyMonster`) into
  `ChromePresenter` and helper modules.
- Relocate item-name styling (`getStyledItemName`) out of the engine path per the
  "one synchronous query to resolve" decision above.
- Leave Svelte components consuming the same `ui` store shape.
- Delete or shrink `src/ui.ts` once it no longer owns renderer or chrome logic.

This phase turns `GameUI` from a god object into wiring.

### Phase 7: Clean Up Test Seams and Ownership

- Replace old partial-`GameUI` test doubles with typed `GamePresenter` fakes.
- Add snapshot mapper tests for visibility, detected monsters, traps, telegraphs,
  item views, and game-over/win flags.
- Add mode/scope tests for dungeon-map, room-scoped presentation, and return to
  full-floor presentation.
- Add renderer smoke tests around `setSnapshot()`, `dispatch()`, reduced motion,
  and animation loop keepalive.
- Document ownership rules in the new presentation modules.

## Keyboard and Input Rules

Keyboard-first gameplay remains engine/action driven. This split should not move
movement, run, search, read, zap, inventory, or modal shortcuts into the map
renderer.

Rules:

- Global gameplay shortcuts stay in `main.ts`/`KeyboardManager` action wiring.
- Modal and overlay focus rules stay in Svelte components and existing action
  gates.
- Renderer-specific pointer hit testing, if any, must be optional and must route
  to existing actions rather than mutating game state directly.
- Aiming state is published as presentation state/event, but the engine remains
  the authority on whether a wand is drawn and where it fires.
- Presentation mode changes must preserve focus predictably. If a mode hides or
  rearranges controls, focus returns to a stable gameplay/chrome target when the
  mode exits.

## Testing

- **Engine unit tests:** assert presenter calls and events with a typed fake.
- **Snapshot tests:** build snapshots from seeded/minimal engine states and
  verify visible/explored/entity data without touching DOM or canvas.
- **Scope tests:** verify room-scoped snapshots include only the intended room
  or arena context while preserving entity visibility rules.
- **Mode tests:** verify mode changes dispatch clean renderer handoffs and return
  to dungeon-map without leaking animation state.
- **Compatibility tests:** during migration, assert adapter calls preserve the
  old `GameUI` behavior shape.
- **Renderer tests:** instantiate the extracted canvas renderer with a test
  canvas, set a snapshot, dispatch representative events, and verify no throws
  plus animation keepalive state.
- **Keyboard verification:** run existing keyboard tests after each phase and add
  coverage if any action wiring changes.
- **Visual proof:** after Phase 4, use browser screenshots to compare a resting
  board before/after extraction at classic and large board sizes.

## Risks and Mitigations

- **Large mechanical move risk:** extract in phases and keep the compatibility
  adapter until the new renderer is stable.
- **Object identity loss:** current animations key off `Monster` references via
  three `WeakMap<Monster, ...>` caches in `GameUI` (`moveAnim`, `lastTile`,
  `dodgeAnim`). Snapshots break that identity. Mitigate with stable render keys
  in `MonsterView` and re-key those caches by render key inside the renderer.
- **Hidden query seam:** the engine's one synchronous read from the UI
  (`getStyledItemName`) is easy to miss because it does not look like a render or
  effect call. Resolve it explicitly (see GamePresenter) rather than smuggling a
  read method onto the one-way port.
- **Duplicated projection logic:** centralize snapshot construction in one mapper
  and chrome overlays in one presenter.
- **Animation loop regressions:** keep `tick()`/`isAnimating()` explicit and test
  floor transitions, monster detection pulse, and telegraphs.
- **Mode leakage:** keep presentation mode in the presenter and snapshots, never
  in renderer-local state that gameplay must inspect.
- **Scoped view hiding critical state:** derive scoped snapshots from the same
  visibility/explored rules and keep log/chrome feedback active.
- **Over-abstracting too early:** only define contracts needed by the current
  renderer and chrome. Defer optional renderer selection UI.

## Completion Criteria

- `GameEngine` imports no concrete `GameUI`.
- Engine tests mock `GamePresenter`, not `GameUI`.
- The current canvas map is implemented as a `MapRenderer`.
- Presentation mode and map scope are represented explicitly, with dungeon-map /
  full-floor as the default.
- Svelte chrome projection is not mixed with canvas drawing code.
- Current gameplay, keyboard behavior, map visuals, overlays, and animations are
  preserved.
- No savegame migration is required.
