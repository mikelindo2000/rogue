# Secret Doors & Searching Plan

## Current state

- Doors are always visible `+` tiles. `src/map.ts` stamps them into room walls as
  soon as a corridor connects to a room.
- There is no search command, no hidden-door tile, and no mechanic where bumping a
  blocked wall spends a turn or reveals anything.
- Running already stops at corridor ends and visible doorways, so the game has the
  right movement texture for a Rogue-style search mechanic, but not the hidden-door
  layer itself.

## Goals

1. Add secret doors that feel like original Rogue: an apparently blank wall at the
   end of a hall can be searched until a door appears.
2. Preserve fairness. The player must never need secret-door knowledge to reach the
   stairs, especially on early floors.
3. Make the feature discoverable during normal play without turning it into a
   modal tutorial or spoiling every secret.
4. Keep the mechanic keyboard-first and turn-based.

## Non-goals

- Do not hide stairs behind secret doors.
- Do not hide the only route to the main level objective.
- Do not require pixel-perfect inspection of the map renderer.
- Do not add a broad trap/disarm system in this work. Secret doors can share the
  future "search" verb, but traps should be a later feature.

## Core rule: stairs must stay on the public path

The staircase room is always reachable through visible doors and corridors.

Implementation rule:

- The room containing `TILE.STAIRS_DOWN` must have no secret-only access.
- The room containing `TILE.STAIRS_UP` must have no secret-only access.
- Any corridor path required by `isReachable(playerStart, stairsDown)` must remain
  reachable when all secret doors are treated as walls.
- On floor 20, every boss room entrance used for the finale must also remain
  visible-path reachable.

Test this with two reachability passes:

1. Normal reachability: secret doors count as revealable doors.
2. Public-path reachability: secret doors count as blocked walls.

The public-path pass must reach all stairs and mandatory boss rooms.

## Floor rollout

Secret doors should be opt-in by depth, not present from turn one.

Recommended tuning:

| Floors | Secret door behavior |
| --- | --- |
| 1-2 | None. Let players learn movement, rooms, doors, stairs, hunger, and combat first. |
| 3 | One guaranteed, non-critical tutorial secret. It may hide a small loot closet or shortcut, never stairs. |
| 4-7 | Low chance on optional loops, dead-end branches, or bonus rooms. |
| 8+ | Normal chance. Still never on mandatory stair routes. |

This avoids a player losing or stalling because they did not know the mechanic,
while still introducing the idea early enough that it can matter during a full run.

## Map model

Add a distinct tile:

```ts
TILE.SECRET_DOOR = '?'
```

This is an internal token. It should not render literally as `?`.

Tile semantics:

- Before discovery:
  - not walkable
  - blocks sight
  - renders as the wall tile it replaced
- After discovery:
  - converts to `TILE.DOOR`
  - is walkable
  - does not block sight beyond existing doorway behavior

Secret doors should store enough context to render correctly. The simplest option
is to only allow secret doors on `WALL_H` and `WALL_V`, then render by inspecting
neighboring wall orientation just like visible doors already do.

## Generation strategy

Start conservative: add secrets after the existing map is fully generated and
validated.

Candidate locations:

- Visible doors that connect to optional rooms, optional loops, or short dead-end
  branches.
- Wall cells at the end of a corridor that already has a valid room interior on
  the other side.
- Bonus rooms that contain extra loot, food, potions, or optional monsters.

Do not choose:

- Any door on a public-path route from player start to down stairs.
- Any door into the up-stair or down-stair room.
- Floor 1 or 2.
- The only entrance to a room containing stairs, bosses, or mandatory progression.

Recommended first implementation:

1. Generate the level as today.
2. Identify the public path from player start to down stairs using BFS.
3. Build a list of visible doors not on that path and not adjacent to stair rooms.
4. On floors 3+, convert a small number of those doors to secret doors.
5. Re-run public-path reachability with secret doors blocked.
6. If validation fails, revert that secret conversion.

This is less ambitious than carving brand-new hidden rooms, but it is much safer.
After that works, optional hidden closets can be added as a second phase.

## Search interaction

Add an explicit search command and a bump-search shortcut.

### Explicit search

- Key: `Space` is recommended.
- Action: spend one turn searching the 8 neighboring tiles.
- Chance:
  - adjacent secret door: 25 percent
  - secret door in the tile the player is facing: 40 percent, if we track facing
  - guaranteed reveal for the floor-3 tutorial secret after 2 failed searches
- On success: convert the tile to `TILE.DOOR`, log `You found a hidden door.`
- On failure: log sparingly, e.g. `You search carefully.` Do not spam failure text
  every turn if nothing is nearby.

### Bump-search

When the player attempts to move into a blocked wall:

- If a secret door is in that target tile or adjacent to that wall segment, run a
  lower-chance search, such as 15 percent.
- Spend a turn only when the bump is plausible search behavior:
  - player is in a corridor or doorway
  - target tile is a wall, not void outside the map
  - not currently game over/won
- On success, reveal the door but do not auto-move through it. The next movement
  step enters the doorway.

This preserves the original "keep tapping at the hallway end" feel without making
every accidental wall bump costly.

## Discoverability

Use layered hints, not a one-time modal.

1. README and footer controls list:
   - `Space search`
2. First eligible floor message:
   - On floor 3, when the guaranteed optional secret exists, log:
     `Some dead ends hide doors. Press Space to search nearby walls.`
3. Contextual hallway hint:
   - If the player runs into a dead-end corridor on floor 3+ and has never revealed
     a secret door in this run, show once:
     `Dead end. You can press Space to search.`
4. First reveal payoff:
   - `You found a hidden door.`
5. Optional center-stage pill:
   - Add a temporary `searchHint` UI state, similar to `stairsNearby`, only when a
     player is at a dead end and the hint has not been shown.

The floor-3 guaranteed secret should hide a small reward, not mandatory progress.
That makes the mechanic learnable without punishing anyone who ignores it.

## State model

Run state:

- Secret doors are part of `map`.
- Revealed doors are persisted in the current floor state cache from the
  bidirectional stairs work, because saving `map` already preserves the conversion.
- Track `secretsFoundThisRun` and `searchHintShown` on `GameEngine` or in a small
  run-state object.

No cross-run persistence is needed for this first version.

## UI and controls

- Register `Space` in `src/main.ts` to call `engine.search()`.
- Add footer hint: `Space search`.
- Add log messages for search attempts and discoveries.
- Do not add a modal.
- Keep controls keyboard-first per `AGENTS.md`.

If `Space` conflicts with browser page scrolling, the existing `KeyboardManager`
should prevent default for registered game bindings.

## Implementation sequence

1. Add `TILE.SECRET_DOOR` and helper predicates:
   - `isSecretDoor`
   - update `isWalkable` and `blocksSight`
2. Update renderer so secret doors draw as wall segments until revealed.
3. Add map candidate selection and safe conversion of optional visible doors.
4. Add validation helpers:
   - public-path reachability with secret doors blocked
   - normal reachability after reveal
5. Add `GameEngine.search()` and bump-search in `handlePlayerMove`.
6. Wire `Space` in `src/main.ts` and footer/README hints.
7. Add the floor-3 guaranteed optional secret and contextual hint.
8. Add tests.

## Test plan

Map tests:

- Floors 1-2 never contain `TILE.SECRET_DOOR`.
- Floor 3 can contain a guaranteed optional secret.
- Down stairs are reachable when secret doors are blocked.
- Up stairs are reachable when secret doors are blocked.
- Floor 20 boss rooms are reachable when secret doors are blocked.
- Secret doors never appear in the up/down stair room wall ring.
- Converting a secret door to `TILE.DOOR` preserves normal reachability.

Engine tests:

- `engine.search()` reveals an adjacent secret door when the reveal roll succeeds.
- Failed searches spend a turn but leave the map unchanged.
- Bumping a plausible wall can reveal a secret door without moving the player.
- Revealed secret doors stay revealed after going down stairs and returning.
- Search does nothing when game over or game won.

UI/check tests:

- `npm run check`
- Browser smoke:
  - start a seeded floor-3 scenario
  - reach the tutorial dead end
  - see the search hint
  - press `Space`
  - verify the hidden door becomes visible and walkable

## Acceptance criteria

- A player can complete every floor without discovering any secret doors.
- Stairs are never hidden behind a secret door.
- The mechanic appears no earlier than floor 3.
- A normal player gets at least one in-game hint before a full run can pass.
- Search is keyboard-accessible and consumes turns consistently.
- Secret door discovery is preserved by floor backtracking.
