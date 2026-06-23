# Visibility & FOV

How the player sees the dungeon. This is the reference for the field-of-view
model, the lit/dark-room distinction, and the items that interact with light.
Implemented across `src/engine.ts` (FOV), `src/map.ts` (generation),
`src/ai/brain.ts` (dark acquisition), and `src/ui.ts` (rendering).

## The three grids

All three are `boolean[][]` shaped exactly like `map` (`[y][x]`).

| Grid | Meaning | Lifetime |
| --- | --- | --- |
| `visible` | In view *this turn*. Rebuilt every `updateFOV()`. | Transient |
| `explored` | Ever seen. Drives the dimmed "remembered" rendering. | Persisted |
| `dark` | Interior tile of an *unlit* room. | Persisted (can't be recomputed — rolled at generation) |

The renderer (`ui.ts`) draws an `explored` tile at full strength when also
`visible`, and at `DIM_ALPHA` otherwise. Monsters and telegraphs draw on
`visible`; items draw on `explored`. **Dark rooms need no renderer change** —
their tiles simply stay out of `visible`/`explored` until the player is adjacent.

## updateFOV (per turn)

1. Mark the player's own tile visible/explored.
2. **Rule A — standing in a dark room** (`dark[py][px]`): reveal only the
   immediate block of radius `BALANCE.fov.darkRadius` (=1 → the 8 surrounding
   tiles). No raycast, no room flood. Return. This is the "you see only your
   immediate eight tiles" rule. Works on a dark stairs tile too (stairs count as
   interior, so they are marked dark).
3. Otherwise **raycast**: `BALANCE.fov.rays` rays at `angleStepDeg`, each walking
   out to `BALANCE.fov.radius`, marking tiles and stopping at the first
   `blocksSight` tile. **Rule B** guards peeking into a dark room from a
   doorway/corridor: when a ray reaches a dark interior tile, it reveals that
   tile only if it is within Chebyshev distance 1 of the player, then stops the
   ray (a dark floor tile does not block sight on its own, so the ray must break
   explicitly or it would sail deeper into the dark).
4. **Lit-room flood** (`revealRoom`): if the player stands on lit interior, flood
   the contiguous room floor and light its full bounding wall ring at once — the
   classic Rogue "a lit room reveals all at once." No-op in corridors/doorways
   (the raycast handles those) and never runs for a dark room (Rule A returned).

`VISION_RADIUS` is `BALANCE.fov.radius` (a tunable, not a hard-coded field).

## Dark rooms (generation)

`generateLevel` builds a `dark[][]` and marks some rooms dark *after* the start
room and stairs are fixed (`map.ts`):

- `darkRoomChance(floor)` = 0 on floors 1–2 (teach the game lit) and floor 20
  (the boss finale stays lit); otherwise it climbs with depth, capped at
  `BALANCE.map.darkRoomMaxChance`.
- The **start room is never dark**. Stair rooms may be dark, gated by
  `BALANCE.map.darkStairRooms` (default true).
- Only interior **floor + stair** tiles are marked — never walls/doors/corridors.

Darkness never changes walkability, so it can never make the stairs unreachable
(the `isReachable` guarantees in `map.ts` are unaffected). A run is completable
with no light item.

## Monster acquisition in the dark

Darkness cuts both ways. A monster standing on a dark tile caps its acquisition
range at `BALANCE.monster.darkAggroRange` (3 → finds the player within ~2 tiles)
instead of `aggroRange` (6). So a creature can't beeline across a pitch-black
room while the player sees only one tile. This governs *acquisition* only — an
already-hunting ambusher keeps its scent. Threaded as an optional `dark` grid
through `BrainContext`; absent (headless balance sim, unit tests) ⇒ all-lit ⇒
legacy behavior.

## Light items

**Scroll of Light** (implemented) — a carried, read-on-demand scroll
(`ScrollType = 'light'`). Reading it floods the current room with permanent light
(`lightCurrentRoom` clears the room's `dark` bits and re-runs FOV). A successful
read consumes the scroll and costs a turn; reading in a lit room or corridor is a
no-op (kept, no turn spent). Spawns from floor 3 as a share of scrolls
(`BALANCE.map.spawn.lightScrollCut`). Read with `r` during play.

**Wand of Light** (phase 2, not implemented) — a reusable charged version. Art
exists (`public/inventory/wand-of-light.png`); see
`design/DARK_ROOMS_AND_LIGHT_PLAN.md` for the charges-subsystem sketch.

## Persistence

`dark` is saved everywhere `explored` is: the floor cache (`FloorState`,
`saveCurrentFloor`/`loadFloorForTravel`) and the full snapshot
(`snapshot`/`restore`, `SaveGameV1` + validation). All paths are
backward-compatible — a save with no `dark` grid restores as all-lit. So a room
you light with a Scroll of Light stays lit after you descend and return.

## Tunables (all in `BALANCE`, `src/config.ts`)

| Knob | Default | Effect |
| --- | --- | --- |
| `fov.radius` | 6 | Sight radius in lit rooms/corridors |
| `fov.darkRadius` | 1 | Sight radius in a dark room (the 3×3) |
| `map.darkRoomBase` | 0.15 | Dark-room chance at floor 3 |
| `map.darkRoomFloorScale` | 0.03 | Per-floor increase |
| `map.darkRoomMaxChance` | 0.5 | Cap |
| `map.darkStairRooms` | true | Whether stair rooms can be dark |
| `map.spawn.lightScrollCut` | 0.5 | Share of floor-3+ scrolls that are Light |
| `monster.darkAggroRange` | 3 | Acquisition range for a monster on a dark tile |
