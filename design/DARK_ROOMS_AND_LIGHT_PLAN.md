# Dark Rooms & Light Items Plan

> Nominal feature: **dark rooms** (the player sees only their immediate eight
> tiles until a room is lit). Primary goal: **solidify the engine** while we are
> in here — the visibility model, the room/runtime data model, and the item
> system all get firmer foundations as a side effect of shipping this.

> **Status:** revised after an independent code-grounded review. The review's
> six must-fix findings are folded in below and flagged inline as **[R]**. A
> consolidated "Review resolutions" list is at the end.

## Current state

### Visibility / FOV (`src/engine.ts`)

The engine recomputes FOV every turn in `updateFOV()`:

1. **Raycast** — `BALANCE.fov.rays` (72) rays at `angleStepDeg` (5°) steps, each
   walking out to `VISION_RADIUS` (a hard-coded class field, currently `6`),
   marking tiles `visible` + `explored` and stopping at the first `blocksSight`
   tile (`engine.ts:163`).
2. **Lit-room flood** — `revealRoom(px, py)` flood-fills the contiguous room
   floor the player stands on and lights its entire bounding wall ring. This is
   the classic Rogue "a lit room reveals all at once" behavior, and it also
   patches the gaps the raycast leaves along one-tile-thick walls
   (`engine.ts:227`). It is a no-op in corridors/doorways (the raycast handles
   those).
3. **`recordSightings()`** — marks monsters in FOV as discovered.

`explored[][]` persists (remembered tiles render dimmed at `DIM_ALPHA`);
`visible[][]` is rebuilt each turn. The renderer (`src/ui.ts:216`) already
draws explored-but-not-visible tiles faded, so **no renderer change is needed**
for dark rooms — they simply stay out of `visible`/`explored` until the player
is adjacent.

### Room data model (`src/map.ts`)

`generateLevel()` builds a rich `Room[]` (bounds, centre, `gone` flag, grid
coords) during carving, then **throws it away** — it returns only `map` plus
scalar `playerX/Y`, `stairsUp/Down` coords. Every runtime feature that needs
"which room is this / what are its bounds" must re-derive rooms by flooding
(`revealRoom` does exactly that, every turn). This is the central limitation
this plan fixes.

### Item system (`src/types.ts`, `src/engine.ts`)

- `Item` is a discriminated union on `type`: `gold | food | scroll |
  repair_scroll | potion | gear`.
- **Potions are named/typed** (`PotionType`, with a shared visual registry in
  `src/itemVisuals.ts`) and are **stored in inventory** (`Inventory.potions`)
  and used on demand via `usePotion()` / `InventoryRef { kind: 'potion' }`.
- **Scrolls are the opposite**: a single opaque `scroll` type with a *random*
  effect (`vigor / fatigue / midas / trap`) applied **immediately on pickup**
  (`engine.ts:649`). There is **no scroll inventory and no read-on-demand
  path** — you cannot carry a scroll. `repair_scroll` is a second one-off.

This asymmetry is the blocker for a "read when you need it" light item.

### Documentation

- `design/SPEC.md` is a UI redesign spec only — it does not document FOV or the
  item system.
- There is **no FOV/visibility design doc** and **no FOV test coverage**
  (`engine.test.ts` only resets the `visible` grid manually).

---

## Goals

1. Some rooms are **dark**: on entry the player sees only the 3×3 block around
   themselves (their tile + the eight neighbours), revealed as they move.
2. Dark rooms scale in **with depth** and never appear so early they punish a
   new player, and never trap a player who lacks light.
3. Add a **Scroll of Light** (and optionally a **Wand of Light**) that lights
   the current room permanently.
4. **Solidify the engine**: surface room metadata to runtime, make vision radius
   tunable, and generalize the scroll/consumable path — each is a real
   foundation, not scope creep, and each is *required* by the feature.
5. Keyboard-first, turn-based, fully tested, documented.

## Non-goals

- No per-tile dynamic light sources / torches / light falloff. Dark vs lit is a
  binary room property (matching original Rogue).
- No unidentified-item / scroll-identification minigame (this game uses named
  items; potions are already named).
- No new equipment slot. The Wand of Light, if built, reuses a consumable-style
  inventory list with charges, not a worn slot.
- Do not make the **start room** dark, and do not require a light item to reach
  the stairs.

---

## Core rule: darkness is never a soft-lock

- The player's **start room is always lit**.
- The down-stairs are always reachable by walking (you discover the room's
  contents as you step through it, even when dark). Dark rooms reduce *sight*,
  never *reachability* — the existing `isReachable` guarantees hold unchanged
  because darkness does not alter walkability.
- Light items are a **convenience/safety** layer, never a gate. A player who
  never finds one can still finish every floor.

---

## Design

### 1. Map model — mark rooms dark at generation

Add a serializable `dark: boolean[][]` grid, parallel to `explored`/`visible`:
`dark[y][x] === true` for every **interior tile** of a dark room. **[R-B1]**
"Interior" must use the *same* predicate `revealRoom` uses — floor **and stair
tiles** (`engine.ts:228`: `FLOOR || STAIR_TILES.has(ch)`) — otherwise standing
on a down-stairs tile inside a dark room would have `dark[py][px] === false`,
Rule A would not fire, and the whole room would light up. Walls, doors, and
corridors are never "dark interior". Rationale for a tile grid over a
`Room[].dark` flag:

- It mirrors the existing `explored`/`visible` grids — same shape, same
  save/restore code path, trivially JSON-serializable.
- Runtime queries are O(1): "am I in a dark room?" is `dark[py][px]`.
- Lighting a room just clears the flooded tiles' `dark` bit — no room lookup.

`generateLevel()` returns `dark` alongside `map`. The engine stores
`this.dark`, includes it in the floor-state cache + full save snapshot, and
restores it (recompute is impossible — darkness is random at generation).
**[R-A2]** This means `dark` must be added in *every* persistence path, not just
the top-level save: `FloorState` (`engine.ts:25`), `saveCurrentFloor()`
(`engine.ts:449`), `loadFloorForTravel()` (`engine.ts:458`), the full snapshot
in `serialize()`/`restore()` (`engine.ts:~970`/`~1000`), and `SaveGameV1` +
its validation in `savegame.ts`. **Miss any one and a room you lit re-darkens
after you descend and return — which directly fails the persistence acceptance
criterion.** Add a focused save→travel→return test (below) to lock this.

**Which rooms are dark** — this pass must run **after** `realRooms`,
`startRoom`, `endRoom`, and the stairs are determined (`map.ts:446-474`), i.e.
right beside `tryPlaceSecretDoors` at `map.ts:~475`, **not** "after carving"
(at carve time the start/stairs rooms aren't known yet). **[R-C5]**

```
darkRoomChance(floor) = (floor < 3 || floor >= 20) ? 0   // [R-D3] floor 20 stays lit
                      : min(BALANCE.map.darkRoomMaxChance,        // e.g. 0.5
                            BALANCE.map.darkRoomBase + (floor-3) * BALANCE.map.darkRoomFloorScale)
```

(The earlier draft cited `goneChance = 0` as floor 20's safeguard — that governs
*gone rooms*, not darkness. The real guard is the `floor >= 20` term above.)

Suggested tuning (all in `BALANCE.map`, tunable):

| Floors | Dark-room behavior |
| --- | --- |
| 1–2 | Never dark. Learn movement, lit rooms, combat, hunger first. |
| 3 | First dark rooms appear (base chance ~0.15). Scroll of Light starts dropping the same floor. |
| 4–19 | Chance climbs with depth, capped (~0.5). |
| 20 | Boss floor stays fully lit (it is already `goneChance = 0`); the finale should never hide in the dark. |

Rules during selection:
- Never mark the **start room** dark.
- The down-/up-stairs rooms **may** be dark (adds tension; stairs are still
  found by walking in), but this is a single `BALANCE` toggle
  (`darkStairRooms`, default `true`) so it is trivial to make them always lit
  if playtesting says otherwise.
- `gone` rooms (corridor junctions) are never dark — they have no interior.

### 2. FOV change (`updateFOV`)

Introduce one predicate and two rules.

```
inDarkRoom = isInteriorFloor(map[py][px]) && dark[py][px]
```

- **Rule A — inside a dark room:** skip the long raycast *and* `revealRoom`.
  Reveal only the 3×3 block around the player (clamped to map bounds). This is
  the literal "immediate eight tiles" of the spec. (Within Chebyshev distance 1
  there is no occlusion to worry about.)
- **Rule B — peeking in from outside (doorway/corridor):** so a dark room is
  not seen end-to-end through its open door, guard the raycast at the reveal
  step (`engine.ts:191-194`). **[R-B2]** Precise rule against the real loop: for
  each stepped cell, *if it is a dark interior tile* then —
  - if Chebyshev distance to the player ≤ 1: mark it visible+explored, **then
    `break`** (a dark tile reveals only itself, never tiles behind it);
  - if Chebyshev distance > 1: **`break` without marking** (skip *and* stop —
    not skip-and-continue, or a far integer cell on the same ray could be
    marked).

  A dark floor tile does not naturally `blocksSight`, so without this explicit
  `break` the existing loop (`engine.ts:194`) would sail straight through it.
  Standing in the doorway you see exactly one tile inside; the rest stays black
  until you step in (where Rule A takes over).

Lit rooms and corridors keep today's behavior exactly (Rule A/B only fire on
dark interior tiles, so non-dark play is untouched).

Move `VISION_RADIUS` into `BALANCE.fov.radius` (see Engine §E2). The dark-room
radius (1) becomes `BALANCE.fov.darkRadius` for symmetry and future tuning.

**Remembered dark tiles:** once you have stepped past a dark tile it stays in
`explored` and renders dimmed — you keep a hand-drawn memory of the room you
groped through. This is slightly kinder than original Rogue (which forgets dark
rooms) and consistent with this game's existing memory model. Keep it; call it
out so it is a decision, not an accident.

**Renderer interactions (no change, but make them decisions). [R-B3]** The
renderer needs no edits, but two consequences must be intentional:
- Monsters draw on `visible` (`ui.ts:259`) and telegraph warnings draw on
  `visible` (`ui.ts:251`). In a dark room only the 3×3 is visible, so a monster
  (and its telegraph) is invisible until it is adjacent. This is the intended
  tension — but see §2c, which keeps it *fair* rather than a pure ambush.
- Items draw on `explored` (`ui.ts:234`), so a scroll on a dark tile you have
  already groped past renders dimmed. Acceptable; noted so it is not a surprise.

### 2c. Monster behavior in darkness *(required design decision)* [R-B4]

Monster aggro is pure Manhattan distance vs `BALANCE.monster.aggroRange` (6)
with **no line-of-sight or light check** (`src/ai/brain.ts`; `aggroRange` in
`config.ts:91`). Left untouched, dark rooms become a one-sided player nerf: the
player sees one tile while monsters sense and path to them from six tiles of
blackness, and the telegraph that would warn the player does not even render
until the creature is adjacent (above). That is an accident, not a design.

**Decision: darkness cuts both ways.** When the player is in an *unlit* room, a
monster **in that same dark room** uses a reduced aggro range
`BALANCE.monster.darkAggroRange` (default = `BALANCE.fov.darkRadius + 1`, i.e.
2). Outside dark rooms, aggro is unchanged. Effect: neither side notices the
other across a black room; an already-hunting monster still behaves normally
(it has your scent), so this only governs *acquisition*, not active pursuit.
This is one small, localized check in `brain.ts`'s target-acquisition step,
gated on a single new `BALANCE` knob, and keeps the lit-room game identical.

Rejected alternatives: (a) leave aggro global — unfair ambushes; (b) freeze
unlit monsters entirely — too generous, removes all dark-room threat. The
reduced-acquisition rule preserves tension (a monster two tiles away in the dark
*will* find you) without the cross-room ambush.

### 3. Light items

Two designs. **Ship the Scroll first** (it fits the existing consumable shape);
the Wand is an optional phase 2 that justifies a small charges subsystem.

#### Scroll of Light (primary — v1)

A named scroll, carried in inventory and **read on demand**. **[R-A1]** Note
`r` is already bound to **Restart** (`main.ts:204-209`). Restart is only
meaningful once the run has ended, so **context-gate `r`**: during active play
it reads the selected/most-relevant scroll; when `gameOver || gameWon` it
restarts (unchanged). This keeps the Rogue "read" mnemonic without a second key.
Reading is also available from the inventory UI via the `InventoryRef` path, so
the keybind is a convenience, not the only route. On read:
flood the player's current room, clear its `dark` bits permanently, reveal
interior + wall ring **by reusing `revealRoom`'s exact flood + ring logic**
(`engine.ts:227`) — do not re-implement room lighting, or the two paths drift
(**[R-C2]**). A successful read consumes the scroll and **costs a turn** (calls
`processTurn`, like `usePotion` at `engine.ts:719`).

Used in an already-lit room or a corridor: no room to light, so log "The light
reveals nothing new.", **do not consume the scroll, and do not call
`processTurn`** (**[R-B6]** — a misclick must not silently burn a turn and a
monster move). This "no wasted read" rule is the recommended default; a stricter
Rogue-style "consume anyway" is a one-line tuning flip.

This requires the scroll-inventory generalization in Engine §E3.

#### Wand of Light (optional — phase 2)

A reusable wand with **charges** (default 5). Same effect per charge; rarer,
deeper. Needs a `wands` inventory list carrying `{ type, charges }` and a use
path. Deferred because it introduces the first charge-bearing item — worth doing
deliberately as its own small subsystem rather than smuggling it in here.

#### Full stats

| Field | Scroll of Light | Wand of Light (phase 2) |
| --- | --- | --- |
| `Item.type` | `scroll` | `wand` (new union member) |
| discriminator | `scrollType: 'light'` (new `ScrollType`) | `wandType: 'light'` |
| Floor glyph | `?` | `/` (classic Rogue wand glyph) |
| Map color | `#ffd86b` (warm gold — distinct from generic scroll `#cc66ff`, repair `#ff00ff`) | `#ffe9a8` (pale gold) |
| UI color / accent | `var(--scroll-light)` / warm-gold | `var(--wand-light)` / pale-gold |
| Inventory | new `scrolls: ScrollType[]` | new `wands: { type; charges }[]` |
| Use key | `r` (read; context-gated vs Restart — see [R-A1]) | `z` (zap) |
| Effect | Light current room (permanent) | Light current room, −1 charge |
| Charges | single-use (consumed) | 5 |
| Rarity | common→uncommon | rare |
| First floor | 3 (with dark rooms) | 6 |
| Spawn hook | new branch in the consumable roll (`map.ts` spawn), gated `floor >= 3` | gear/relic roll, `floor >= 6` |
| Stacking | multiple in `scrolls[]` | one entry per wand, charges tracked |
| Inventory art | `public/inventory/scroll-of-light.png` | `public/inventory/wand-of-light.png` |
| Line icon | reuse `book` or add `scroll-light` sun-rune glyph (`src/ui/icons.ts`) | add `wand` glyph |

Balance note: the Scroll of Light is **utility, not power** — it should be
roughly as common as a potion so dark floors are tense but manageable. Tune via
the consumable-roll cut points in `BALANCE.map.spawn`.

---

## Engine improvements (the primary goal)

Ordered by leverage. E1 and E3 are *required* by the feature; the rest are
small solidifications that the feature makes natural to do now.

### E1 — Surface room metadata from `generateLevel` *(foundational, required)*

`generateLevel` already computes `Room[]` then discards it (`map.ts:399-413`,
return at `map.ts:565` omits it). Return it. Benefits:

- Dark-room marking needs per-room iteration — clean with the room list.
- A runtime room identity (an optional `tileRoomId` map) gives every future
  feature (treasure rooms, "you enter the Hall of …" messages, room-scoped
  spawns, maze rooms) an O(1) room lookup for free.

**[R-A3] Hard scope line: room metadata is NOT serialized.** Lighting a room
and the dark-check depend **only** on the `dark[][]` grid plus `revealRoom`'s
existing flood — neither needs a room table at runtime. So:
- `dark[][]` is the single source of truth that *is* persisted (§1, [R-A2]).
- `rooms` / `tileRoomId` are an in-memory generation+convenience product. They
  are used at generation time (dark marking) and may be rebuilt cheaply from the
  `map` on load if a later feature wants them — but they never enter
  `FloorState`, `SaveGameV1`, or restore. This avoids adding another grid to the
  save schema and its validation.

Callers of `generateLevel` are only `engine.ts:134` and the tests, which use
`ReturnType<typeof generateLevel>` (`map.test.ts:11`) — so *adding* return
fields is low-risk and auto-tracked by the tests.

This is the single biggest "solidify the engine" win and unblocks the feature.

### E2 — Make `VISION_RADIUS` a BALANCE knob *(small, on-theme)*

Move the hard-coded `engine.ts:57` field to `BALANCE.fov.radius` (= 6) and add
`BALANCE.fov.darkRadius` (= 1). Every other tunable already lives in `BALANCE`;
this closes the gap and makes both normal and dark vision designer-editable.

### E3 — Generalize scrolls into a carry + read path *(required for the item)*

Bring scrolls up to parity with potions:

- Add `ScrollType` (start: `'light'`) and a `scrollVisual` registry mirroring
  `POTION_VISUALS` (`src/itemVisuals.ts`).
- Add `scrolls: ScrollType[]` to `Inventory`, `InventoryRef { kind: 'scroll' }`,
  and `useScroll(index)` mirroring `usePotion`. **[R-B6]** "Mirroring" is more
  than one function: the UI uses the `InventoryRef` path, so a complete read
  flow touches **five sites**, not one — `InventoryRef` (`types.ts`),
  `useInventoryItem` (`engine.ts:~801`), `performInventoryAction`
  (`engine.ts:~813`), the `equipInventoryItem` reject list (`engine.ts:~776`,
  so a scroll can't be "equipped"), and the `usePotionType`-style dispatch.
  Budget for all five.
- Floor `scroll` items gain optional `data: { scrollType }`. **Migration:** the
  existing opaque random-effect scroll stays as-is (no `scrollType` → keep
  current immediate-on-pickup behavior); a typed scroll (`scrollType: 'light'`)
  is **picked up into inventory** instead of consumed. This is additive and
  backward-compatible with old saves (their scrolls have no `data`). **[R-B5]**
  But `savegame.ts` item validation only checks that `type` is a string — add a
  guard that a `scroll` with `data` has a known `scrollType`, so a corrupt/old
  typed scroll can't splice an `undefined` type into `inventory.scrolls`.
- **[R-C1]** Reading a scroll should emit an `item.consume` sound (cf. potions,
  `engine.ts:719`); add the event to `src/audio/events.ts` and a manifest entry
  per `AGENTS.md`, or reuse the existing consume cue. Pickup of a typed scroll
  keeps the existing `'scroll'` pickup cue.
- Wire the context-gated `r` (read scroll, see [R-A1]) in `src/main.ts` and the
  inventory UI, keyboard-first.

### E4 — `roomForEncounter` exhaustiveness *(robustness)*

`map.ts:281` switches over `placement` with only `endRoom`/`finalRoom` and **no
default** — a future placement value returns `undefined`, and `spawnEncounter`
then **throws** at `encounterSpawnTiles(room)` (`map.ts:246`, deref of
`room.cx`). Add a `default` (assert/never) so the next encounter type fails
loudly at the source with a clear message.

### E5 — Documentation backfill *(the "missing documentation" ask)*

- **New:** `design/VISIBILITY_AND_FOV.md` — the raycast + lit-room flood +
  `explored`/`visible`/`dark` model, now that a feature depends on it. (This
  doc's "Current state" section is a seed for it.)
- **New / extend:** an items overview that states the potion-vs-scroll-vs-gear
  shapes and the "add a new consumable" checklist (today this knowledge is split
  across `itemVisuals.ts`, `icons.ts`, and `INVENTORY_IMAGE_GENERATION.md`).
- Update `README`/footer controls with the `r` (read) key and a one-line note
  that some rooms are dark.

### E6 — FOV test coverage *(closes a real gap)*

There are currently no FOV tests. Add them alongside this feature (see Test
plan). Even pre-feature, `revealRoom` and the raycast are untested.

---

## Image generation

Both assets follow `design/INVENTORY_IMAGE_GENERATION.md` (FLUX.2-klein-4B,
512×512, 2 steps). Add these rows to that doc's Subject Hints table:

| Item | Subject | Seed |
| --- | --- | --- |
| Scroll of Light | aged rolled parchment scroll tied with cord, a glowing golden sun rune blazing on its face radiating warm light | 8500 |
| Wand of Light | slender polished wooden wand tipped with a radiant glowing crystal orb casting warm light | 8501 |

Accent color: warm gold (scroll) / pale gold (wand). Output:
`public/inventory/scroll-of-light.png`, `public/inventory/wand-of-light.png`
(slugs match `inventoryArtUrl()`).

---

## Implementation sequence

1. **E2** — `BALANCE.fov.radius` / `darkRadius`; replace the `VISION_RADIUS`
   field + its only consumer (`engine.ts:183`).
2. **E1** — return `rooms` (in-memory only, **not** serialized — [R-A3]) from
   `generateLevel`; consume at engine construction.
3. **Dark map model** — add `dark[][]`; mark dark rooms *after* stairs are set
   ([R-C5]); `BALANCE.map.darkRoom*` knobs with the floor-20-safe formula
   ([R-D3]); **persist `dark` in `FloorState` + `saveCurrentFloor` +
   `loadFloorForTravel` + full snapshot + `SaveGameV1` + validation** ([R-A2]).
4. **FOV** — `inDarkRoom` predicate (interior incl. stairs, [R-B1]) + Rule A +
   the skip-and-break Rule B ([R-B2]) in `updateFOV`.
5. **Monster acquisition in dark** — `BALANCE.monster.darkAggroRange`; reduced
   acquisition for unlit monsters in `brain.ts` ([R-B4]).
6. **E3** — `ScrollType` + `scrollVisual`; `Inventory.scrolls`; `useScroll` +
   all five `InventoryRef` sites ([R-B6]); typed-scroll pickup + savegame guard
   ([R-B5]); context-gated `r` ([R-A1]) + UI; consume sound ([R-C1]).
7. **Scroll of Light** — conditional spawn branch (floor ≥ 3, [R-D4]); `light`
   effect reuses `revealRoom` ([R-C2]); turn-cost on success, no-op = no
   consume/no `processTurn` ([R-B6]); logs.
8. **Assets/docs** — PNGs (done); register visual; update
   `INVENTORY_IMAGE_GENERATION.md`, `README`, footer; write
   `VISIBILITY_AND_FOV.md`.
9. **E4** — `roomForEncounter` default.
10. **Tests** (below).
11. *(Phase 2, optional)* **Wand of Light** + charges subsystem.

Each step is independently shippable and leaves the game playable.

## Test plan

**Map (`map.test.ts`):**
- Floors 1–2 produce no dark tiles; floor 3+ can.
- The start room is never dark; floor 20 is never dark.
- Dark-room chance is monotonic non-decreasing with floor (sampled).
- `dark` only marks interior floor (never walls/doors/corridors/void).

**FOV (new `engine.test.ts` cases):** note `updateFOV` calls `recordSightings`
→ `saveDiscovery` ([R-C4]); tests must stub/ignore the discovery-persistence
side effect (the constructor already touches storage via `loadDiscovery`).
- In a dark room, exactly the 3×3 around the player is `visible`; the rest of
  the room is not.
- Standing on a **dark-room stairs tile** still shows only the 3×3 ([R-B1]).
- Moving one tile reveals the new 3×3 and keeps prior tiles in `explored`
  (dimmed), not `visible`.
- Standing in a doorway into a dark room reveals at most one interior tile, and
  nothing behind it ([R-B2]).
- A lit room still fully reveals (regression).
- A corridor still reveals up to `BALANCE.fov.radius` (regression).

**Monster (`brain` tests, [R-B4]):**
- A monster in an unlit room does not acquire a player beyond
  `darkAggroRange`; the same monster in a lit room acquires at `aggroRange`.
- An already-hunting monster keeps pursuing into/within the dark.

**Items (`engine.test.ts` / `items.test.ts`):**
- A `scrollType: 'light'` floor item is picked up into `inventory.scrolls`, not
  consumed.
- An opaque (untyped) scroll still applies its random effect on pickup
  (backward-compat).
- `useScroll` on a light scroll in a dark room clears that room's `dark` bits,
  reveals it, and consumes the scroll.
- `useScroll` in a lit room/corridor reveals nothing new, does **not** consume,
  and does **not** advance a turn ([R-B6]).
- A `scroll` with `data` but an unknown `scrollType` is rejected by savegame
  validation ([R-B5]).
- **Persistence ([R-A2]):** light a dark room, descend, return — the room is
  still lit and `dark` is still cleared (FloorState cache *and* full
  save→restore).

**Check / smoke:**
- `npm run check`.
- Seeded floor-3 run: enter a dark room (only 3×3 visible), read Scroll of
  Light, confirm the whole room lights and stays lit after leaving/returning.
- Keyboard: `r` reads from inventory; arrow/Enter parity per `AGENTS.md`.

## Acceptance criteria

- From floor 3, some rooms reveal only the player's 3×3 until lit; floors 1–2
  and floor 20 never do.
- The start room is always lit; every floor is completable with no light item.
- Scroll of Light is carryable, read with `r`, and permanently lights the
  current room; its effect and lit state persist across floor backtracking.
- `VISION_RADIUS` and dark-room tuning live in `BALANCE`.
- `generateLevel` exposes room metadata to the engine.
- FOV and dark-room behavior are covered by tests; `npm run check` is green.
- `design/VISIBILITY_AND_FOV.md` exists and the item/visibility docs are current.

---

## Review resolutions

An independent reviewer read this plan against the real source. Each finding and
its resolution (all folded into the sections above):

| Tag | Finding | Resolution |
| --- | --- | --- |
| R-A1 | `r` is already bound to **Restart** (`main.ts:204`) | Context-gate `r`: read during play, restart when game over. §3, stats table, E3. |
| R-A2 | `dark[][]` omitted from `FloorState` + floor cache → lit state lost on backtrack | Persist `dark` in every save path; dedicated persistence test. §1, seq 3, tests. |
| R-A3 | `tileRoomId`/`rooms` serialization hazard | Hard line: room metadata is in-memory only; lighting depends solely on `dark[][]` + `revealRoom`. E1. |
| R-B1 | Stairs tile in a dark room isn't `dark` → room fully reveals when you reach the stairs | `dark` marks interior **incl. stairs**, matching `revealRoom`'s predicate. §1, tests. |
| R-B2 | Rule B skip-vs-break ambiguity vs the real raycast loop | Spelled out: ≤1 mark-then-break, >1 break-without-mark. §2. |
| R-B3 | "No renderer change" glosses monster/item visibility consequences | Made explicit as intended behavior. §2 renderer note. |
| R-B4 | Monster aggro ignores darkness → one-sided ambush | New §2c: `darkAggroRange` reduces *acquisition* for unlit monsters. Seq 5, tests. |
| R-B5 | Typed-scroll forward validation gap in `savegame.ts` | Add `scrollType` validation guard. E3, tests. |
| R-B6 | `useScroll` ≈ 5 `InventoryRef` sites; no-op must not burn a turn | Enumerated sites; no-op = no consume / no `processTurn`. §3, E3, tests. |
| R-C1 | No consume-sound for reading a scroll | Add `item.consume` scroll event per `AGENTS.md`. E3. |
| R-C2 | Risk of a second room-lighting implementation diverging from `revealRoom` | Light by reusing `revealRoom`. §3. |
| R-C4 | `updateFOV` has discovery side effects that complicate unit tests | Tests stub discovery persistence. Test plan. |
| R-C5 | Dark-marking placement was "after carving" but start/stairs unknown then | Move pass to after stairs are set (`map.ts:~475`). §1, seq 3. |
| R-D2 | `roomForEncounter` missing case throws (not a render glitch) | Corrected; add `default`. E4. |
| R-D3 | `darkRoomChance` formula didn't actually exclude floor 20 | Added `floor >= 20 ? 0` term. §1. |
| R-D4 | Light-scroll spawn needs a gated branch, not just a cut-point shift | Conditional `floor >= 3` spawn branch. Seq 7. |

Reviewer-confirmed-sound (no change needed): the `dark[][]`-grid choice over a
`Room[].dark` flag, the soft-lock/reachability reasoning (darkness never alters
`isWalkable`), the E1 diagnosis, and the scroll-vs-potion asymmetry diagnosis.
