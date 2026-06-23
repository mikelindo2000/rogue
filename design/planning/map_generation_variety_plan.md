# Map Generation Variety Plan

Status: **first slice implemented** (2026-06-23). This doc records what shipped
and keeps a short menu of deferred ideas for later.

The goal was more memorable floors without leaving classic Rogue behind. Original
Rogue got its variety from three dials it already had: random room size within
each cell, "gone" (corridor) cells, and random contents. The shipped slice turns
those same dials harder rather than adding a new genre of dungeon — no floor
profiles, no merged-room graph rewrite, no archetype/metadata model.

## Implemented

All in `src/map.ts`, knobs in `src/config.ts` (`BALANCE.map`), tests in
`src/map.test.ts`.

### 1. Less predictable monster placement

Normal random monsters were pinned to each room's top-left interior tile
(`room.l + 1, room.t + 1`), a visible per-floor tell. They now scatter to a
random interior tile via rejection sampling (8 tries), skipping the player tile,
occupied tiles, and item tiles — and skipping the spawn rather than forcing an
overlap if no tile is free. Centred hero/boss encounter placement is unchanged.

### 2. Room size modes

Each room rolls a size mode before sampling its interior:

- `largeRoomChance` (0.16): bias toward the cell's largest safe interior — a
  grand chamber.
- `smallRoomChance` (0.16): bias toward the minimum — a closet.
- otherwise: the full range, as before.

Both stay within `[roomMin, cell max]`, so start/stairs/encounter rooms are no
smaller or larger than today's possible extremes and need no special handling.

### 3. Maze cells

The authentic Rogue "different-shaped room": at most one cell per floor can fill
with a twisty maze of corridors instead of a rectangle.

- `mazeRoomMinFloor` (4) and `mazeRoomChance` (0.12); never on floors 1-3 or 20.
- Carved by a randomized depth-first backtracker on an even lattice (`carveMaze`);
  the void between corridors is the maze's walls, so no new tile is needed.
- Maze cells are excluded from "real rooms" (no player/stairs/items/monsters/traps
  spawn in them) but participate in the connectivity graph through a maze branch
  in `makeExit`. They draw from the same non-room budget as gone cells, so a floor
  always keeps at least four real rooms.

**Reachability fix (from review):** a maze links to the floor through a
neighbouring real room's door, which is a valid secret-door candidate.
`tryPlaceSecretDoors` previously guarded only the player→down-stairs path, so it
could seal a maze off (~3.4% of mazes). It now also requires every maze anchor to
stay reachable without searching. Swept clean: 0 orphaned mazes across floors
4-19 × seeds 1-500.

### Tests

`src/map.test.ts` covers: monster scatter is off-corner and never on a
player/item/another monster; rooms span near-min to near-max within bounds; mazes
appear only on floors 4-19, at most one per floor, are corridor-filled and
walkable-reachable across a full floors 4-19 × seeds 1-400 sweep; no item/monster
spawns inside a maze; no real room is fully orphaned on a maze floor. A
serialization-free `mazeRects` debug field on the generator return exists purely
as a test seam (the engine ignores it).

## Deferred (not built)

Kept out of the first slice deliberately — each adds structure/test surface
without being needed for "bigger rooms, different shapes, more variety":

- **Floor profiles** — depth-keyed probability sets. A couple of depth-scaled
  constants cover most of the value; promote to profiles only once several knobs
  genuinely need to co-vary by depth.
- **Merged rooms** — one room spanning two cells. The most interesting structural
  idea, but the only one needing a logical-room-group graph rewrite (where
  duplicate/missing-connection bugs hide). Should follow now that the seeded
  geometry tests exist to catch graph mistakes.
- **Room archetypes** (treasure, lair, shrine, gauntlet, finale) — generation-time
  recipes for contents/placement on top of size/kind. Additive content; can come
  later without changing structure.
- **Geometry archetypes** (pillar rooms, secret closets) — need interior-
  connectivity validation inside altered rooms.
- **Corridor detours / dead-end branches** — extra turns and short branches for
  passage interest; low-risk but unscoped here.

### Open questions if/when those resume

- Should merged rooms ever contain stairs, or stay optional?
- Should floor 20 become a custom finale arena, or stay classic 3x3?
- Should large/merged rooms allow more than one door per wall?
- Should archetype labels ever surface to the player, or stay invisible?

### Review checklist for future structural work

- Does any new topology make stairs, heroes, or bosses unreachable?
- Does any feature require a secret/search mechanic for mandatory progress?
- Are dark rooms, traps, and monster placement combining unfairly?
- Does merged-room graph handling create duplicate or missing connections?
- Do tests prove invariants over enough seeds and floors?
- Is floor 20 still an explicit, readable finale?
