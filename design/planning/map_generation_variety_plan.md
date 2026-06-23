# Map Generation Variety Plan

This plan expands the existing classic-Rogue map generator without replacing its
best property: every floor is built from a bounded room graph, then validated for
reachability. The target is more memorable floors, not a new genre of dungeon.

Scope requested:

- rare large rooms
- merged rooms
- floor profile tuning
- room archetypes
- less predictable monster placement

The plan is written as a menu of phases so we can review the pieces, choose a
subset, then implement and test only what we decide to ship.

## Current State

- `generateLevel` in `src/map.ts` divides the board into a `3x3` grid.
- Each grid cell becomes either:
  - a real rectangular room with explicit wall/corner glyphs, or
  - a gone room: a single corridor junction.
- Corridors are generated from a randomized spanning tree over adjacent cells,
  plus extra loop edges from `BALANCE.map.extraConnChance`.
- Real rooms are bounded by the current config:

  ```ts
  roomMinW: 4,
  roomMaxW: 11,
  roomMinH: 3,
  roomMaxH: 6,
  ```

- Because the current board is `46x29`, the `3x3` cell layout means those maxes
  are only partly reachable:
  - left and middle columns can only fit interior width `10`; only the right
    column can fit `11`.
  - top and middle rows can only fit interior height `4`; only the bottom row
    can fit `6`.
- The start room is the first real room in reading order. The down-stairs room is
  the last real room in reading order. Hero and final encounters use the end
  room.
- Secret doors, dark rooms, and hidden traps already depend on room metadata and
  safe room classification.
- Normal random monsters currently spawn at each eligible room's top-left
  interior tile, which is mechanically safe but visibly repetitive.

## Goals

1. Add more room-scale variety while preserving guaranteed reachability.
2. Make floors feel different by depth, not only by monster/loot tables.
3. Support named room archetypes that can drive size, lighting, contents, and
   spawn rules.
4. Keep mandatory progression fair: start, stairs, hero rooms, and floor 20
   remain readable and reachable without hidden mechanics.
5. Make monster placement less patterned while avoiding immediate unfair traps.
6. Keep the implementation testable with seeded map tests and deterministic RNG.
7. Preserve keyboard-first gameplay. Map changes must not introduce interactions
   that lack keyboard parity.

## Non-goals

- No freeform cave generator in this plan.
- No diagonal movement requirement.
- No soft-locks behind secret doors, dark rooms, traps, or merged-room geometry.
- No save format change unless we choose to persist new room metadata. The first
  implementation should avoid persistence changes.
- No audio work. If future room archetypes add sound cues, follow the existing
  sound docs and keep audio additive.

## Design Principles

1. **Keep the graph first.** The generator should still know which logical cells
   or room groups are connected before carving details.
2. **Separate logical rooms from rendered rectangles.** A normal room is one
   logical room and one rectangle. A merged room is one logical room covering
   multiple grid cells. A secret closet may be a bonus logical room.
3. **Classify rooms once, then let features consume that classification.** Dark
   rooms, traps, encounters, loot, and monster placement should all ask room
   metadata instead of re-deriving intent from tile glyphs.
4. **Make special cases explicit.** Start, stairs, boss/finale, tutorial, secret,
   and trap-eligible rooms should be flags, not implicit coordinate guesses.
5. **Prefer rare spice over constant churn.** Large rooms and merged rooms should
   be memorable because they are uncommon.

## Proposed Data Model

The current internal `Room` can grow into a richer generation-time model:

```ts
type RoomKind =
  | 'normal'
  | 'small'
  | 'large'
  | 'merged'
  | 'closet'
  | 'treasure'
  | 'lair'
  | 'shrine'
  | 'gauntlet'
  | 'finale';

type RoomRole =
  | 'start'
  | 'upStairs'
  | 'downStairs'
  | 'hero'
  | 'boss'
  | 'optional'
  | 'secret';

interface GenRoom {
  id: number;
  gx: number;
  gy: number;
  cells: Array<{ gx: number; gy: number }>;
  gone: boolean;
  kind: RoomKind;
  roles: Set<RoomRole>;
  archetype?: RoomArchetypeId;
  l: number;
  t: number;
  r: number;
  b: number;
  cx: number;
  cy: number;
}
```

Returned `RoomRect` can stay conservative at first:

```ts
export interface RoomRect {
  l: number;
  t: number;
  r: number;
  b: number;
  cx: number;
  cy: number;
}
```

If later systems need archetype/role data at runtime, add a separate
serialization-free `RoomMeta` return. Do not persist it until a concrete runtime
feature requires it.

## Floor Profiles

Add a floor-profile layer above raw `BALANCE.map` constants. Profiles choose
probabilities and constraints by depth.

```ts
type FloorProfileId =
  | 'training'
  | 'classic'
  | 'gloom'
  | 'vaults'
  | 'lairs'
  | 'labyrinth'
  | 'finale';

interface FloorProfile {
  id: FloorProfileId;
  floorMin: number;
  floorMax: number;
  goneRoomChance: number;
  extraConnChance: number;
  smallRoomChance: number;
  largeRoomChance: number;
  mergedRoomChance: number;
  roomArchetypeWeights: Partial<Record<RoomArchetypeId, number>>;
  corridorDetourChance: number;
  deadEndBranchChance: number;
  allowDarkRooms: boolean;
  allowSecretClosets: boolean;
  allowTraps: boolean;
}
```

Recommended first tuning:

| Floors | Profile | Intent |
| --- | --- | --- |
| 1-2 | `training` | No dark rooms, no traps, simple mostly normal rooms. |
| 3-5 | `classic` | Current feel plus rare small/large rooms. |
| 6-9 | `gloom` | More dark rooms and secret-door value. |
| 10-13 | `vaults` | Rare large/treasure rooms and more loops. |
| 14-17 | `lairs` | Monster lairs, gauntlets, occasional merged rooms. |
| 18-19 | `labyrinth` | More gone rooms, more loops, corridors matter. |
| 20 | `finale` | Fully roomed, lit, explicit boss-safe layout. |

Keep profile selection deterministic from `dungeonFloor`, not random, for easier
testing and balance.

## Rare Large Rooms

### Definition

A rare large room is still contained within one grid cell, but its dimensions are
biased toward the largest interior that cell can safely hold.

Because the current grid limits top/middle row height and left/middle column
width, a "large" room should mean "large relative to its cell," not always
`11x6`.

### Implementation

1. Compute each cell's safe max interior width/height as today.
2. When a real room is selected, roll room size mode:
   - `small`
   - `normal`
   - `large`
3. For `large`, sample from the top of the local range:

   ```ts
   minLargeW = Math.max(roomMinW, maxIW - 2);
   minLargeH = Math.max(roomMinH, maxIH - 1);
   iw = rng.range(minLargeW, maxIW);
   ih = rng.range(minLargeH, maxIH);
   ```

4. Never force start/end rooms to be large in v1. Let them be eligible later only
   after playtesting.

### Suggested tuning

- Floors 1-2: `0%`
- Floors 3-5: `6%`
- Floors 6-13: `10%`
- Floors 14-19: `12%`
- Floor 20: explicit finale sizing, not profile-random.

### Tests

- Across seeded floors, large rooms never exceed their cell bounds.
- Large rooms remain enclosed by wall/corner glyphs.
- Large-room chance produces at least one large room across a broad deterministic
  seed sample.
- Start/stairs reachability remains unchanged.

## Merged Rooms

### Definition

A merged room consumes two adjacent grid cells and carves one larger rectangle
across their combined safe region.

This is the real route to rooms that feel substantially bigger than today's
grid-cell cap.

### Constraints

- Only merge orthogonally adjacent cells.
- Only one merged room per floor in the first implementation.
- Do not merge on floors 1-2.
- Do not merge on floor 20 until the finale layout is deliberately redesigned.
- Do not merge cells that would reduce real-room count below the current safety
  floor.
- Do not make the start room or end room merged in v1.
- A merged room should have at least two potential connection sides, so it does
  not become a giant dead end unless an archetype explicitly wants that.

### Graph approach

Recommended approach: plan room groups before carving.

1. Build the `3x3` cell list.
2. Pick gone cells.
3. Pick at most one merge candidate among remaining non-gone cells.
4. Replace those cells with a single logical room group.
5. Build graph edges between logical groups, not raw cells.
6. Run the same randomized spanning tree over logical groups.
7. Add extra loops.
8. Carve each logical room group.
9. Connect group edges by choosing exits on the appropriate side of each group.

This avoids the awkwardness of connecting to two separate cells that later
become the same room.

### Carving

For a horizontal merge:

- use the left cell's pulled-in left boundary and the right cell's pulled-in
  right boundary.
- use the overlap of their vertical safe ranges.
- cap final width/height with profile limits.

For a vertical merge:

- use the top cell's pulled-in top boundary and the bottom cell's pulled-in
  bottom boundary.
- use the overlap of their horizontal safe ranges.
- cap final width/height with profile limits.

Avoid carving all the way to the combined maximum every time. Merged rooms should
vary between "large hall" and "grand chamber."

### Door policy

Existing tests expect at most one door per room wall. For merged rooms, this is
still fine for v1 and keeps the classic feel. Later, large/merged rooms can opt
into a second entrance through an archetype.

### Tests

- Merged rooms never overlap other rooms.
- The consumed cells do not also produce normal rooms or gone junctions.
- The graph remains connected.
- Down stairs are reachable without secrets.
- Secret-door placement does not choose mandatory merged-room entrances.
- Trap placement treats a merged room as one room for "one trap per room" rules.
- Hero/final encounters still spawn in a valid end/finale room.

## Small Rooms

Small rooms are not in the original requested scope as heavily as large rooms,
but they are the natural contrast that makes large rooms feel large.

### Definition

A small room is a real room with a smaller interior range, such as:

```ts
smallRoomMinW: 3,
smallRoomMaxW: 4,
smallRoomMinH: 2,
smallRoomMaxH: 3,
```

### Constraints

- Never use a small room as the start room.
- Never use a small room as the down-stairs room on floors with a hero encounter.
- Never place a final boss in a small room.
- Avoid placing traps in the smallest rooms; there is not enough pathing slack.

### Uses

- loot closet
- dead-end side room
- secret closet
- tiny shrine
- empty tension room

### Tests

- Encounter spawn tile selection works in tiny interiors.
- Items/monsters/traps do not collide in small rooms.
- FOV and Scroll of Light still flood the whole room.

## Room Archetypes

Room archetypes are generation-time recipes layered on top of room size/kind.
They should choose placement rules, contents, and safety restrictions. They
should not bypass global fairness checks.

```ts
type RoomArchetypeId =
  | 'plain'
  | 'dark'
  | 'treasure'
  | 'lair'
  | 'shrine'
  | 'gauntlet'
  | 'secret_closet'
  | 'pillar_room'
  | 'finale';

interface RoomArchetype {
  id: RoomArchetypeId;
  allowedKinds: RoomKind[];
  minFloor: number;
  maxFloor?: number;
  mayBeStart: boolean;
  mayContainStairs: boolean;
  mayContainHero: boolean;
  mayContainBoss: boolean;
  mayBeDark: boolean;
  mayContainTraps: boolean;
  apply: (room: GenRoom, ctx: GenerationContext) => void;
}
```

### Starter archetypes

#### Plain

The current default: normal room, regular spawn chances.

#### Treasure

Purpose: a reward room that changes route decisions.

Rules:

- min floor: 4
- prefer small, normal, or large rooms
- no start room
- no boss room
- no hidden traps in v1 unless revealed or thematically obvious
- guarantee one extra loot roll
- lower monster chance or place a guard, but not both in v1

#### Lair

Purpose: a combat-forward room.

Rules:

- min floor: 6
- prefer large or merged rooms
- at least one monster if the room is not otherwise special
- reduce loose loot chance
- never dark plus hidden trap in v1

#### Shrine

Purpose: quiet contrast and possible future item interactions.

Rules:

- min floor: 5
- small or normal room
- no generated monster
- no trap
- optional food/scroll bias
- no new action in this plan

#### Gauntlet

Purpose: a corridor/room pressure point.

Rules:

- min floor: 10
- prefer long large rooms or merged rooms
- monster placement favors far side from entry
- no trap adjacent to entry
- no down stairs unless explicitly reviewed

#### Secret closet

Purpose: make secret doors hide actual optional space, not only existing doors.

Rules:

- min floor: 4
- small room only
- exactly one secret-door entrance
- never on public path
- contains a small reward or a mild monster, not mandatory progression

#### Pillar room

Purpose: make larger rooms tactically distinct.

Rules:

- min floor: 8
- large or merged rooms only
- carve 1-3 interior wall/pillar tiles after validating walkable connectivity
- keep all items, stairs, and encounter spawns reachable
- do not place pillars adjacent to stairs or doors in v1

#### Finale

Purpose: explicit floor-20 boss arena.

Rules:

- floor 20 only
- lit
- no traps
- no gone cells
- no secret required path
- enough open tiles for both required bosses and player movement

### Archetype ordering

Apply archetypes after basic room carving but before:

1. dark-room marking
2. encounter placement
3. normal item/monster spawning
4. trap placement

That lets downstream systems respect archetype flags.

## Less Predictable Monster Placement

### Current issue

Normal random monsters are placed at `room.l + 1, room.t + 1`. Across floors,
that creates a visible top-left pattern and wastes the room-size variety we add.

### Proposed placement helper

Add one helper that all monster placement uses, including random monsters and
archetype guards:

```ts
function chooseMonsterSpawnTile(
  room: GenRoom,
  ctx: GenerationContext,
  options?: {
    avoidPlayer?: boolean;
    avoidStairs?: boolean;
    avoidDoors?: boolean;
    avoidItems?: boolean;
    avoidTraps?: boolean;
    preferFarFrom?: { x: number; y: number };
    preferLit?: boolean;
  }
): { x: number; y: number } | null;
```

Candidate rules:

- tile must be walkable floor or stairs only when explicitly allowed.
- no collision with existing monster.
- no collision with item.
- no armed trap.
- not adjacent to stairs.
- not adjacent to the player's initial position.
- not adjacent to the room's door unless the archetype asks for a guard.
- prefer lit tiles when dark-room fairness matters.

For ordinary rooms, choose uniformly from safe candidates after filtering.

For lairs and gauntlets, weight candidates farther from the most likely entry or
from the player/start room.

### Special encounters

Hero and boss encounters should keep their existing near-center behavior for now,
but should call the same helper with a centered preference. This gives future
merged/finale rooms a single safe path without changing encounter balance
accidentally.

### Tests

- For seeded floors, normal monsters are not always top-left.
- No monster spawns on an item, trap, wall, door, secret door, or void.
- No non-special monster spawns adjacent to the starting player.
- Hero and boss encounters still spawn reliably.
- Lair/gauntlet monsters prefer valid non-door-adjacent tiles when available.

## Corridor and Hall Interest

This was not in the requested implementation list, but it is closely related and
should be designed alongside room variety.

### Low-risk additions

- **Detour corridors:** instead of one L turn, sometimes use two turns.
- **Short dead-end branches:** carve a branch off a corridor, optionally ending at
  a secret closet candidate.
- **Loop profile tuning:** profiles can increase/decrease `extraConnChance`.
- **Junction emphasis:** gone rooms can become more deliberate 3-way or 4-way
  junctions instead of a single tile with pass-through corridors.

### Constraints

- Corridors remain `TILE.CORRIDOR`; no new tile needed.
- Existing renderer already draws corridor connectivity from neighboring passage
  tiles, so visual variety follows from carve shape.
- Dead-end branches should have a reason often enough to avoid feeling like pure
  noise: secret, loot, trap clue, or tactical route.

### Tests

- Corridors remain connected.
- No corridor opens raw floor adjacent to void around rooms.
- Run movement still stops at doors, monsters, and corridor ends correctly.

## Generation Pipeline

Recommended target pipeline:

1. Resolve the `FloorProfile` for `dungeonFloor`.
2. Compute grid cell regions.
3. Choose gone cells using the profile, with existing max-gone guard.
4. Choose at most one merged-room pair from remaining cells.
5. Build logical room groups.
6. Assign room size modes: small, normal, large, merged.
7. Carve room rectangles and gone-room junctions.
8. Build logical adjacency edges.
9. Generate spanning tree plus profile-tuned loops.
10. Carve corridors, including optional detours/branches.
11. Pick start and end rooms from eligible real rooms.
12. Mark room roles: start, stairs, hero, boss, optional, secret.
13. Assign room archetypes.
14. Apply archetype geometry details, such as pillars, with local connectivity
    validation.
15. Place stairs.
16. Place secret doors/secret closets.
17. Mark dark rooms.
18. Place special encounters.
19. Place normal items.
20. Place normal monsters with the new spawn helper.
21. Place traps after all room safety classifications are known.
22. Run final validation.

This is intentionally more explicit than the current function. It may be worth
extracting generation helpers into small pure functions rather than letting
`generateLevel` grow indefinitely.

## Validation Gates

Every generated floor should pass:

- player start is in bounds and walkable.
- up/down stairs are in bounds and walkable when present.
- down stairs are reachable from player start without revealing secrets.
- all walkable tiles that matter are connected or deliberately optional behind a
  secret.
- rooms do not overlap.
- every real room is enclosed by valid walls/corners/doors.
- secret doors are not on mandatory stair paths.
- floor 20 is lit, trap-free, and has required bosses.
- dark room tiles mark only floor/stairs.
- trap placement respects existing optional-room safety rules.
- monsters and items do not collide.
- no monster/item/trap lands in invalid geometry.
- start room is never dark, trapped, or immediately hostile.

For archetypes, add an optional debug summary in test builds:

```ts
{
  profile: 'lairs',
  rooms: [
    { id: 3, kind: 'merged', archetype: 'lair', roles: ['optional'] }
  ]
}
```

This summary does not need to ship to runtime saves.

## Test Plan

### Unit and seeded generator tests

- `FloorProfile` resolves correctly by floor.
- small/large/merged probabilities are zero on forbidden floors.
- rare large rooms stay inside cell bounds.
- merged room grouping consumes exactly two cells.
- room count never falls below the minimum.
- logical graph is connected.
- public-path reachability still holds with secret doors blocked.
- floor 20 remains fully roomed, lit, trap-free, and boss-valid.
- monster spawn helper filters invalid candidates.
- normal monster placement uses more than one interior position across a seed
  sample.
- archetype restrictions are enforced:
  - no lair as start room.
  - no treasure room as boss room.
  - no trap in shrine.
  - no dark hidden-trap combo in v1.

### Regression tests

Keep or adapt existing tests for:

- four-corner room parsing.
- no room overlap.
- at most one door per wall, except for any explicitly allowed future archetype.
- traps only on safe optional room floor tiles.
- dark-room FOV behavior.
- secret-door search behavior.
- hero and final boss placement.

### Visual/manual proof

For each accepted implementation phase:

1. Generate sample floors for fixed seeds across depth bands.
2. Capture at least one browser screenshot for:
   - normal profile
   - large room
   - merged room
   - lair/treasure archetype
   - floor 20 finale
3. Verify keyboard movement/search still works around new geometry.

### Balance smoke

Run a lightweight simulation or seed sweep that records:

- average real-room count by floor.
- average corridor tile count by floor.
- average loop count by profile.
- large/merged/archetype frequency.
- monster count and average distance from player start.
- trap count and trap-room categories.

This is not a replacement for playtesting, but it catches bad tuning fast.

## Implementation Sequence

### Phase 0 - Measurement only

- Add helper(s) in tests or a dev script to summarize generated floor geometry.
- Record current baseline distributions for room count, room area, corridor
  count, loop count, dark rooms, traps, and monster spawn positions.
- No gameplay changes.

### Phase 1 - Safer monster placement

- Add `chooseMonsterSpawnTile`.
- Move normal random monster placement off `room.l + 1, room.t + 1`.
- Keep special encounter placement visually similar.
- Add focused seeded tests.

This is the lowest-risk player-visible improvement.

### Phase 2 - Floor profiles and rare large rooms

- Introduce `FloorProfile`.
- Route existing map knobs through the resolved profile.
- Add large-room mode within current grid bounds.
- Add tests proving profile restrictions and large-room bounds.

### Phase 3 - Room archetype metadata

- Add generation-time room kind/role/archetype fields.
- Convert existing dark/trap/secret safety checks to consume metadata where useful.
- Add plain, treasure, lair, shrine as non-geometry-changing archetypes first.

### Phase 4 - Corridor detours and branches

- Add profile-tuned detour corridor carving.
- Add short branch carving where it cannot break reachability.
- Keep branches low-frequency until reviewed visually.

### Phase 5 - Merged rooms

- Refactor from cell rooms to logical room groups.
- Add at most one two-cell merged room on eligible profiles.
- Validate all room, trap, secret, encounter, and dark-room interactions.

### Phase 6 - Geometry archetypes

- Add pillar rooms and secret closets.
- Validate local connectivity inside altered rooms.
- Expand visual/manual proof.

## Independent Review Checklist

Ask the reviewer to focus on risks rather than taste:

- Does any new topology make stairs, heroes, or bosses unreachable?
- Does any generated feature require a secret/search mechanic for mandatory
  progress?
- Are dark rooms, traps, and monster placement combining unfairly?
- Does merged-room graph handling create duplicate or missing connections?
- Do tests prove invariants over enough seeds and floors?
- Did we preserve keyboard-first gameplay for any new interaction?
- Did we avoid save format churn unless runtime state truly requires it?
- Is floor 20 still an explicit, readable finale?

## Open Questions

1. Should merged rooms be allowed to contain stairs after v1, or stay optional?
2. Should floor 20 become a custom merged/finale arena, or remain classic 3x3?
3. Should treasure rooms ever be dark?
4. Should secret closets be part of this bundle, or a separate secret-door phase?
5. Should large/merged rooms allow more than one door per wall?
6. Should lairs guarantee a monster, or only bias monster chance upward?
7. Should room archetype labels ever appear to the player, or stay invisible?

## Recommended First Slice

Start with:

1. Phase 0 baseline measurement.
2. Phase 1 less predictable monster placement.
3. Phase 2 floor profiles plus rare large rooms.

That slice gives immediate variety, has low structural risk, and creates the
profile foundation needed for merged rooms and archetypes. Merged rooms are the
most interesting structural change, but they should follow after the tests and
metadata are ready to catch graph mistakes.
