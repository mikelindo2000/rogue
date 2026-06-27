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

### `MapSnapshot`

Add a rendering-oriented snapshot assembled by the engine or a dedicated mapper.
It should be plain data and deeply immutable from the renderer's point of view.

```ts
// src/presentation/mapSnapshot.ts
export interface MapSnapshot {
  cols: number;
  rows: number;
  floor: number;
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
```

The initial version can keep `kind` aligned with the existing `TILE` vocabulary.
The important change is ownership: renderers consume a snapshot; they do not hold
references to `Player`, `Monster`, or `Item` objects.

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
- Deep-copy arrays and entity views enough that renderer animation cannot mutate
  engine state.
- Preserve current tile vocabulary and current visibility/explored behavior.
- Keep the compatibility adapter translating the snapshot back into current
  `GameUI.render()` until the renderer is extracted.

This phase locks down the engine-to-map data contract.

### Phase 3: Convert Effect Calls to Events

- Replace calls such as `ui.fxHit()`, `ui.fxDeath()`, `ui.mapRumble()`, and
  `ui.beginFloorTransition()` with `publishEvent(...)`.
- Keep a one-to-one event translation in the adapter.
- Remove direct mutation of presentation fields such as
  `ui.combatFocusMonster`; represent focus as event/snapshot data instead.
- Add tests that key gameplay paths emit the expected presentation events.

This phase decouples gameplay timing from a specific renderer API.

### Phase 4: Extract Current Canvas Renderer

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

### Phase 5: Extract Chrome Presenter

- Move `updateStats()`, `updateDropdowns()`, `renderLogs()`, `syncDiscovery()`,
  inventory view construction, and board-derived overlay projection into
  `ChromePresenter` and helper modules.
- Leave Svelte components consuming the same `ui` store shape.
- Delete or shrink `src/ui.ts` once it no longer owns renderer or chrome logic.

This phase turns `GameUI` from a god object into wiring.

### Phase 6: Clean Up Test Seams and Ownership

- Replace old partial-`GameUI` test doubles with typed `GamePresenter` fakes.
- Add snapshot mapper tests for visibility, detected monsters, traps, telegraphs,
  item views, and game-over/win flags.
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

## Testing

- **Engine unit tests:** assert presenter calls and events with a typed fake.
- **Snapshot tests:** build snapshots from seeded/minimal engine states and
  verify visible/explored/entity data without touching DOM or canvas.
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
- **Object identity loss:** current animations use `WeakMap<Monster, ...>`.
  Mitigate with stable render keys in `MonsterView`.
- **Duplicated projection logic:** centralize snapshot construction in one mapper
  and chrome overlays in one presenter.
- **Animation loop regressions:** keep `tick()`/`isAnimating()` explicit and test
  floor transitions, monster detection pulse, and telegraphs.
- **Over-abstracting too early:** only define contracts needed by the current
  renderer and chrome. Defer optional renderer selection UI.

## Completion Criteria

- `GameEngine` imports no concrete `GameUI`.
- Engine tests mock `GamePresenter`, not `GameUI`.
- The current canvas map is implemented as a `MapRenderer`.
- Svelte chrome projection is not mixed with canvas drawing code.
- Current gameplay, keyboard behavior, map visuals, overlays, and animations are
  preserved.
- No savegame migration is required.
