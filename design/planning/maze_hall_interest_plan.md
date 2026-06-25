# Maze Hall Interest Plan

Status: **planning**.

The new maze cells add good geometry: they break up the old 3x3 room rhythm and
make some floors feel less rectangular. The current implementation deliberately
keeps mazes off the real-room spawn list, so they contain no normal treasure,
monsters, or traps. In play, that makes them visually interesting but
strategically empty. Once the player recognizes that pattern, the correct move is
to cut through only when the maze is on the shortest route and ignore the rest.

This plan makes maze halls worth exploring without turning them into mandatory
gauntlets or full rooms in disguise.

## Current State

- `src/map.ts` can carve at most one maze cell per floor from floor 4 through
  floor 19 (`mazeRoomChance`), never on floor 20.
- A maze is represented internally as a `Room` with `maze: true`, corridor tiles,
  and a `mazeRects` debug return for tests.
- `realRooms` explicitly filters mazes out, and all ordinary room content loops
  over `realRooms`.
- Items, random monsters, stairs, dark rooms, and traps currently spawn only in
  real rooms.
- Secret-door placement already protects maze reachability by treating a maze's
  carved origin as a `mustReach` anchor.
- Existing tests assert that no item or monster spawns inside a maze. Those tests
  should be replaced with more precise rules once maze content exists.

## Goals

1. Give maze halls an optional reward loop: a player should sometimes find a
   reason to walk deeper than the through-route.
2. Preserve fairness: mazes must not become unavoidable damage, hidden taxes, or
   progression blockers.
3. Keep mazes distinct from rooms. They should feel like cramped, risky hall
   pockets, not rectangular loot rooms with different walls.
4. Reuse existing systems first: item spawn records, depth-gated monsters,
   hidden traps, search, FOV, message log, and sound events.
5. Keep the first slice small enough to test with seed sweeps.

## Non-goals

- No new monster species in the first slice.
- No new audio assets in the first slice.
- No new terrain tile type for maze floors.
- No mandatory quest item, stair, hero, or boss placement inside mazes.
- No mazes on floor 20.
- No guaranteed maze on every floor.

## Design Rule

Maze halls should be **optional risk/reward pockets**.

The player can always progress without fully clearing a maze. The maze payoff is
that a side branch might hold a cache, a guardian, or a readable hazard. The cost
is time, hunger, visibility uncertainty, and cramped fighting positions.

That means:

- Rewards can sit in dead ends and side branches.
- Monsters can guard optional pockets, but not required pass-through tiles.
- Traps can appear only after the trap system's fairness rules are preserved.
- Search can reveal extras, but never become required to reach the maze reward
  promised by normal visual exploration.

## Placement Model

Add a small maze analysis step after the maze is carved and connected:

```ts
interface MazeContentSite {
  x: number;
  y: number;
  kind: 'deadEnd' | 'branch' | 'deepPath';
  distanceFromEntry: number;
  degree: number;
}
```

The generator can derive this from the raw map:

- Collect corridor tiles inside each maze rect.
- Find boundary entry tiles where external corridors connect into the maze.
- Compute distance from the nearest entry with BFS.
- Count orthogonal walkable neighbours to classify dead ends and branches.
- Exclude boundary tiles, entry-adjacent tiles, and tiles adjacent to stairs,
  doors, secret doors, or existing monsters/items/traps.

Do not expose this structure to runtime saves. It is a generation helper, like
the current internal `Room` shape.

## Phase 1: Maze Caches

Add a small chance that an eligible maze contains one visible cache.

Recommended first tuning:

- `mazeCacheChance`: `0.55` when a maze exists.
- `mazeCacheMinFloor`: `4`.
- One cache maximum per maze.
- Prefer `deadEnd` sites, then `branch`, then deepest remaining path.
- Cache contents are visible floor items, not a new container UI.

Suggested cache roll:

- 45% gold
- 25% potion or scroll
- 15% food
- 10% wand/staff when floor-eligible, otherwise scroll
- 5% gear using the normal rarity curve

Why this first:

- Items do not block movement.
- Pickup behavior, item rendering, logging, inventory handling, and persistence
  already exist.
- A visible item in a dead end is enough to teach "mazes can matter" without
  adding combat or trap risk yet.

Implementation seams:

- Add `BALANCE.map.mazeContent` knobs in `src/config.ts`.
- Add a `collectMazeContentSites()` helper in `src/map.ts`.
- Add `spawnMazeCache()` after ordinary room item/monster spawns and before
  traps are placed, so trap placement can see occupied item tiles.
- Keep cache item construction on the same item-spawn paths as room loot rather
  than inventing a new item representation.

Tests:

- A seed sweep proves caches appear only on walkable corridor tiles inside
  `mazeRects`.
- Caches never overlap monsters, stairs, or other items.
- Caches never appear on floor 1-3 or floor 20.
- A sweep proves every cache is reachable from the player without discovering a
  secret door.
- Existing "no items in mazes" tests become "only maze-cache items can appear in
  mazes."

## Phase 2: Maze Denizens

After caches feel good, add optional maze monsters.

Recommended first tuning:

- `mazeMonsterChance`: `0.35` when a maze exists.
- `mazeMonsterMinFloor`: `5`.
- One normal monster maximum per maze in v1.
- Place on a branch/deep-path site, not the same tile as the cache.
- Prefer a tile within 2-4 steps of the cache if a cache exists, so the monster
  feels like a guardian rather than random hallway clutter.

Use the existing depth-gated random monster picker. Do not add one-off monster
emits or new sound cues. Normal combat/death sounds should resolve through the
existing monster sound cascade.

Fairness rules:

- Never place a maze monster adjacent to an entry tile.
- Never place a maze monster on the shortest path between two maze entries.
- Never place a maze monster in a one-tile chokepoint if it would force combat
  for floor traversal.
- Do not place special hero or boss encounters in mazes.

Tests:

- A seed sweep proves maze monsters are floor-eligible, walkable, reachable, and
  non-overlapping.
- A path test proves player-to-stairs reachability remains possible without
  killing the maze monster.
- Floor 20 remains maze-free and unchanged.

## Phase 3: Searchable Maze Details

Once visible caches and denizens work, add a small chance for a searchable detail.

Candidate details:

- Loose stone: `Space` search reveals gold or a scroll.
- Draft crack: search reveals a secret side tile inside the maze bounds.
- Scratched warning: search reveals one nearby trap or monster position for a
  short duration.

Keep these subtle. The primary reason to enter a maze should be visible
curiosity, not exhaustive wall-searching.

Recommended tuning:

- One searchable detail maximum per maze.
- Only from floor 6 onward.
- Never required for the visible cache.
- Search hint should use the existing message log and visible focus of the
  current tile/neighbourhood.

Keyboard requirement:

- `Space` already searches. Any new searchable maze detail must work from the
  keyboard with the same command and must not add pointer-only affordances.

## Phase 4: Optional Maze Hazards

Only after traps have enough balance proof, allow a rare maze trap.

Recommended first tuning:

- `mazeTrapChance`: `0.15` when a maze exists.
- `mazeTrapMinFloor`: `7`.
- At most one maze trap.
- Use existing trap kinds and trigger behavior.
- Prefer dead-end or cache-adjacent side pockets.

Do not place maze traps:

- on the path between maze entries
- adjacent to a maze entry
- adjacent to the cache tile
- on a tile with only two neighbours that is part of the through-route
- in the first reachable tile after a door or secret door

This keeps maze traps as optional tension rather than a tax on using the maze for
connectivity.

## UI And Feedback

The first slice should not need new controls or overlays. It should, however,
make the existing feedback feel deliberate:

- Visible item glyphs should render normally in maze corridors.
- Monster glyphs should render normally in FOV.
- Pickup, combat, search, and trap messages should use existing log enrichment.
- If later art polish adds a "glint" or cache affordance, it must be visible in
  keyboard-only play and not rely on hover.

## Balance Notes

Maze rewards should be modest. They should compensate for exploration time and
hunger cost, not become the best loot source on the floor.

Suggested expectations across eligible maze floors:

- Most mazes have either a cache or a denizen.
- Some mazes have both.
- A few mazes stay empty, so the player never gets perfect certainty.
- The best payoff is usually a consumable or small gear chance, not guaranteed
  high-rarity equipment.

If playtesting shows players still ignore mazes, raise cache visibility and
chance before adding more danger. If players feel forced to clear every maze,
lower gear chance first.

## Verification Checklist

- `npm test -- src/map.test.ts`
- Seed sweep floors 4-19 across at least 500 seeds:
  - no unreachable stairs
  - no unreachable maze cache
  - no cache/monster/trap overlap
  - no maze content on floors 1-3 or 20
  - no maze monster blocks the only player-to-stairs route
- Manual keyboard pass:
  - enter and leave a maze with movement keys
  - pick up a maze cache with keyboard movement
  - fight or avoid a maze denizen
  - use `Space` search if searchable details are implemented
  - confirm focus and global shortcuts behave normally after messages/modals

## Suggested Build Order

1. Land `collectMazeContentSites()` with tests only.
2. Add Phase 1 maze caches and tune with seed sweeps.
3. Add Phase 2 maze denizens only after cache density feels worth exploring.
4. Reassess whether searchable details add meaningful play or just busywork.
5. Add maze traps last, and only if the optional-route safety tests are strong.

