# Hidden Traps Plan

Hidden trap tiles add a classic Rogue pressure point: the floor itself becomes a
thing worth reading. The feature should make searching and cautious movement
matter without turning every room into a coin flip that kills the run.

This plan covers five trap kinds:

- Bear Traps
- Sleep Gas
- Dart Traps that drain strength
- Teleport Traps
- Trapdoors that drop the player to the next floor

## Current state

- Physical floor traps do not exist. The only trap-like effect is the legacy
  random scroll branch in `GameEngine.checkItems()`, which deals fixed damage on
  pickup.
- The map already has hidden-door infrastructure:
  - `TILE.SECRET_DOOR` in `src/tiles.ts`
  - conservative secret-door placement in `src/map.ts`
  - `GameEngine.search()` on `Space`
  - bump-search for secret doors
  - `searchHintShown` / `secretsFoundThisRun` run state
- Dark rooms and Scrolls of Light are present on the current branch. Traps need
  to be fair when visibility is limited, so initial placement should avoid dark
  rooms until trap balance is proven.
- Runs are 20 floors. Floor 20 is the finale and should stay free of random
  hidden traps.

## Goals

1. Add hidden floor traps that are invisible until stepped on or found by
   searching.
2. Keep traps meaningful through movement cost, repositioning, debuffs, and
   forced descent, not large burst damage.
3. Preserve run fairness. A player who never searches should be inconvenienced,
   sometimes put in danger, but not routinely killed by a single hidden tile.
4. Reuse the existing `Space` search command rather than adding a second
   detection verb.
5. Persist revealed and spent traps across stair travel and save/restore.
6. Add enough simulation and seeded checks to tune trap density before the
   feature ships.

## Non-goals

- No disarm skill in the first version.
- No trap use by monsters in the first version.
- No traps on doors, stairs, corridors, walls, or void.
- No hidden traps on floor 20.
- No audio generation from runtime code. If trap cues are added, follow
  `design/implemented/sound_effects_system_plan.md` and
  `design/implemented/sound_effect_asset_prompts.md`.

## Core rule: traps punish choices, not mandatory progress

Traps should appear on optional room floor tiles. They must never be placed:

- in the starting room
- on or adjacent to up/down stairs
- in the floor-20 finale
- in a room containing a required hero or boss encounter
- in corridors or doorway chokepoints
- in a dark room for the first implementation
- adjacent to another trap

This keeps traps from becoming unavoidable tolls. A trap can surprise the
player, but generation should not require stepping on one to navigate the floor.

## Map model

Do not represent traps as `TILE` entries. A trap is not terrain: hidden traps
render as ordinary floor, revealed traps still occupy walkable floor, and spent
traps remain remembered. Keep terrain and trap state separate.

Add a serializable trap grid or trap list:

```ts
export type TrapKind = 'bear' | 'sleep_gas' | 'dart' | 'teleport' | 'trapdoor';

export interface TrapState {
  id: string;
  kind: TrapKind;
  x: number;
  y: number;
  revealed: boolean;
  armed: boolean;
}
```

Recommended internal shape:

- Store `traps: TrapState[]` on `GameEngine`, `FloorState`, and `SaveGameV1`.
- Build a transient lookup map in engine helpers when needed:
  `trapAt(x, y): TrapState | undefined`.
- Keep `armed=false` traps in the list so revealed spent traps can render dimly
  and can appear in end-game stats.

Why a list instead of a `TrapState | null` grid:

- The number of traps is small.
- Save payloads stay compact.
- Tests can assert trap counts and kinds directly.
- The renderer can receive only visible/revealed trap overlays.

## Trap behavior

All traps follow the same trigger contract:

1. Moving onto an armed hidden trap reveals it.
2. Moving onto an armed revealed trap still triggers it. Revealed traps are
   avoidable by pathing, not safe.
3. Triggering sets `armed=false` unless the trap kind explicitly says otherwise.
4. Triggering logs a clear message and keeps visual feedback. Sound is additive.
5. Triggering normally costs a turn. Trapdoor travel is the exception: it moves
   the player to the next floor and does not also run the old floor's monster
   turn.

### Bear Trap

Purpose: pins the player in place and creates local danger if monsters are near.

Effect:

- Reveal and spend the trap.
- Deal 0-2 damage, capped so it cannot kill by itself.
- Apply `bearTrapTurns = 2` on floors 4-9, `3` on floors 10+.
- While trapped, movement commands fail, log `The bear trap holds you fast.`, and
  spend a turn. Non-movement actions such as attacking an adjacent monster,
  eating, reading, drinking, and searching remain available.
- Each spent turn decrements `bearTrapTurns`.

Balance notes:

- No bear traps before floor 4.
- Do not place one in a room that already contains a monster at generation time
  until playtests show this is fair.
- The trap is scary because it changes the local fight, not because it deals
  lethal damage.

### Sleep Gas

Purpose: steals time and lets the dungeon act.

Effect:

- Reveal and spend the trap.
- Apply `sleepTurns = 2`.
- During sleep, player commands are ignored, each sleep turn processes monsters,
  hunger, status timers, FOV, and autosave.
- If a visible monster is adjacent when the trap fires, cap initial sleep to
  `1` turn. The player already made contact with immediate danger; the trap
  should not create a helpless death spiral.
- Taking damage wakes the player after that monster turn resolves.

Balance notes:

- No sleep gas before floor 5.
- Do not place sleep gas in dark rooms in v1.
- The cap near adjacent monsters matters. Sleep gas plus darkness plus monster
  aggro is the main unfair-combo risk.

### Dart Trap

Purpose: creates a lasting attack penalty that the player cares about.

Effect:

- Reveal and spend the trap.
- Deal 1-3 damage, capped so it cannot kill by itself.
- Add one stack of `strengthDrained`, capped at:
  - 1 stack on floors 6-10
  - 2 stacks on floors 11-15
  - 3 stacks on floors 16-19
- Player attack uses `max(1, player.baseAtk - strengthDrained)` before temporary
  strength bonuses.
- Potion of Strength should first clear all `strengthDrained`, then apply its
  existing temporary strength buff. This gives the player a readable recovery
  path without adding a new item in v1.

Balance notes:

- No dart traps before floor 6.
- Do not allow two dart traps on the same floor before floor 12.
- The drain must be visible in the character panel or log enough that the player
  understands why their attacks are weaker.

### Teleport Trap

Purpose: turns room knowledge and positioning upside down without direct damage.

Effect:

- Reveal and spend the trap.
- Move the player to a safe floor tile on the same floor.
- Candidate destination rules:
  - walkable floor only
  - not stairs
  - not another armed trap
  - not adjacent to a monster
  - prefer non-dark room tiles; allow dark only if no safe lit tile exists
- After teleport, update FOV, log `A teleport trap twists the room away.`, then
  process one turn.

Balance notes:

- No teleport traps before floor 7.
- Teleport should never put the player beside a boss, hero, or monster.
- Teleport can be helpful sometimes. That is fine; it makes traps less purely
  punitive.

### Trapdoor

Purpose: forces descent and tempo loss.

Effect:

- Reveal and spend the trap.
- Drop the player to the next floor, using the same floor-state save/load
  guarantees as stairs.
- Deal 0-3 fall damage, capped so it cannot kill by itself.
- Place the player at the up-stairs tile on the new floor, matching normal
  descent arrival.
- Log `A trapdoor opens beneath you!`.
- Emit a separate sound event later, not `map.stairs`, so audio can distinguish a
  fall from chosen travel.

Balance notes:

- No trapdoors before floor 8.
- No trapdoors on floors 18, 19, or 20 for v1. Dropping a player into the finale
  by surprise is too swingy.
- Trapdoors should be rare: at most one generated per run segment of floors 8-17
  until playtests prove the forced descent is not too harsh.

## Floor rollout and trap budget

Use a hazard budget instead of a raw trap count. Each trap kind has a cost, and
each floor gets a maximum budget. This avoids stacking multiple high-impact traps
on one floor.

| Floors | Budget | Allowed kinds |
| --- | ---: | --- |
| 1-3 | 0 | none |
| 4-5 | 1 | bear, sleep_gas |
| 6-7 | 1 | bear, sleep_gas, dart |
| 8-10 | 2 | bear, sleep_gas, dart, teleport, trapdoor |
| 11-15 | 2 | all kinds |
| 16-17 | 3 | all kinds |
| 18-19 | 2 | bear, sleep_gas, dart, teleport |
| 20 | 0 | none |

Trap costs:

| Kind | Cost |
| --- | ---: |
| Bear Trap | 1 |
| Sleep Gas | 1 |
| Teleport Trap | 1 |
| Dart Trap | 2 |
| Trapdoor | 2 |

Recommended first tuning:

- Floor 4 has a 50 percent chance of one low-impact trap.
- Floors 5-7 have a 65 percent chance of spending their budget.
- Floors 8-15 spend at least one budget point and have a 40 percent chance of
  spending the second.
- Floors 16-19 spend at least one budget point and have a 50 percent chance of
  spending additional budget.
- Never place more than one trap in the same room.

These numbers should be moved into `BALANCE.map.traps` before implementation
lands.

## Generation strategy

Add trap placement after rooms, stairs, dark rooms, encounters, and items are
known. Traps depend on all of those systems.

Candidate selection:

1. Start with real room interior floor tiles.
2. Exclude the start room.
3. Exclude rooms containing stairs.
4. Exclude rooms containing `special: 'hero'` or `special: 'boss'` monsters.
5. Exclude dark-room tiles in v1.
6. Exclude item tiles and monster tiles.
7. Exclude tiles adjacent to stairs, traps, doors, or corridors.
8. Exclude any room that already received a trap.

Placement:

1. Determine the floor budget.
2. Build eligible trap kinds for the floor.
3. Shuffle candidates and kinds with the floor RNG.
4. Place traps until the budget is spent or no safe candidates remain.
5. Assert/fuzz that generated traps satisfy placement invariants.

The generator should degrade gracefully. If a floor has no safe trap candidate,
it gets no traps. Never force a trap into a risky tile to satisfy a quota.

## Search and reveal

`Space` should search for both secret doors and traps.

Recommended behavior:

- Search checks the eight neighboring tiles.
- It can reveal one hidden thing per turn.
- Adjacent hidden trap reveal chance: 35 percent.
- Adjacent secret door reveal chance stays at 25 percent unless balance says
  otherwise.
- If both a secret door and trap are eligible, prefer revealing the trap. A trap
  is immediate safety information.
- A successful trap search logs a kind-specific message:
  - `You notice a bear trap.`
  - `You smell sleep gas venting from the floor.`
  - `You spot a dart hole in the wall.`
  - `You notice a strange rune in the floor.`
  - `You find a hidden trapdoor.`
- A failed search keeps the current `You search carefully.` message.

Bump-search should stay secret-door-only. Traps live on floor tiles, so bumping a
wall should not discover them.

## UI and rendering

Hidden traps render exactly like floor.

Revealed traps:

- Draw a small floor overlay when the trap tile is visible or explored.
- Use a shared trap glyph for v1, such as `^`, plus color by kind.
- Render spent traps dimmer than armed traps.
- Do not add a modal.

The footer already lists `Space search`; keep that. If a first-trap hint is
needed, use the message log, not a blocking tutorial:

`The floor looks worked here. Press Space to search nearby tiles.`

Only show the hint once per run, no earlier than floor 4, and only when the
player is near an eligible hidden trap but has not revealed or triggered one.

## Engine and status model

Add the following run state:

```ts
public traps: TrapState[] = [];

public trapEffects = {
  bearTrapTurns: 0,
  sleepTurns: 0,
  strengthDrained: 0,
};
```

`strengthDrained` can also live on `Player` if it is better surfaced as a player
attribute. The key requirement is that it persists and affects attack
calculation in one place.

Movement flow:

1. If `sleepTurns > 0`, movement commands do not move. Process a sleep turn.
2. If `bearTrapTurns > 0`, movement commands do not move. Process a trapped
   turn.
3. Normal combat check.
4. Normal movement.
5. After entering a tile, check for an armed trap before item pickup.
6. Trigger trap effect.
7. If the trap did not cause trapdoor travel, process the turn.

Item pickup should happen after trap trigger. If a tile somehow has both an item
and a hidden trap despite generator rules, the trap fires first; the player can
pick up the item after surviving the tile.

## Persistence

Persist trap state anywhere floor-specific state is saved:

- `FloorState`
- `saveCurrentFloor()`
- `loadFloorForTravel()`
- `snapshot()`
- `restore()`
- `SaveGameV1`
- save validation and old-save backfill

Backfill rule for older saves:

- missing `traps` means `[]`
- missing `trapEffects` means all zero

Persistence tests should cover:

- revealed trap stays revealed after descending and returning
- spent trap stays spent after descending and returning
- active `bearTrapTurns`, `sleepTurns`, and `strengthDrained` survive save/restore
- older saves without trap fields still load

## Audio

Do not generate or fetch audio in runtime/game code.

When adding trap audio:

1. Read `design/implemented/sound_effects_system_plan.md`.
2. Read `design/implemented/sound_effect_asset_prompts.md`.
3. Add typed events in `src/audio/events.ts`, for example:

```ts
| { type: 'map.trapReveal'; kind: TrapKind }
| { type: 'map.trapTrigger'; kind: TrapKind }
```

4. Add manifest mappings after local assets exist.
5. Add prompt rows to the asset prompt guide.

Until assets exist, logs and visual effects are enough.

## Implementation sequence

1. Add trap types and config:
   - `TrapKind`, `TrapState`
   - `BALANCE.map.traps`
   - trap effect state
2. Add trap generation:
   - candidate collection
   - floor budget
   - kind weighting
   - placement invariants
3. Add persistence:
   - current floor cache
   - save snapshot/restore
   - save validation and old-save backfill
4. Add search reveal:
   - search result union for secret door vs trap
   - trap reveal logs
   - no bump-search for traps
5. Add trigger effects:
   - bear trap
   - sleep gas
   - dart drain
   - teleport
   - trapdoor
6. Add rendering:
   - revealed trap overlays
   - spent trap dimming
7. Add UI polish:
   - attack stat reflects strength drain
   - one-time trap hint if needed
8. Add optional audio events and assets.
9. Run balance simulation, adjust budgets, and only then broaden placement into
   dark rooms if it still seems fair.

## Test plan

Map tests:

- Floors 1-3 and 20 generate no traps.
- Trap floors never exceed their hazard budget.
- Every trap is on `TILE.FLOOR`.
- No trap appears in the start room.
- No trap appears in a room with stairs.
- No trap appears adjacent to stairs, doors, corridors, or another trap.
- No trap appears on an item or monster spawn.
- No trap appears in a dark room in v1.
- Trapdoors never appear on floors 18-20.
- Generation is deterministic for the same seed.

Engine tests:

- `search()` can reveal an adjacent hidden trap and spends one turn.
- Failed search spends one turn and leaves trap hidden.
- Search prefers a nearby trap over a nearby secret door.
- Stepping on a hidden trap reveals and triggers it.
- Stepping on a revealed armed trap triggers it.
- Stepping on a spent trap does nothing.
- Bear trap blocks movement for the configured turns but permits non-movement
  actions.
- Sleep gas skips turns, wakes on damage, and caps duration near adjacent visible
  monsters.
- Dart trap increases `strengthDrained`, affects attack math, and Potion of
  Strength clears the drain.
- Teleport trap never lands the player adjacent to a monster or on another trap.
- Trapdoor saves the old floor and loads the next floor without running an old
  floor monster turn.
- Game over and game won states block search and trap processing.

Persistence tests:

- Revealed and spent traps survive stair travel.
- Trap effects survive save/restore.
- Missing trap fields in old saves backfill safely.

UI and keyboard checks:

- `Space` search works with traps and still works with secret doors.
- Movement keys stay inactive under modals/menus.
- Revealed trap overlays render when visible/explored.
- Hidden traps do not visually leak before reveal.
- Strength drain is visible in the relevant stat surface.

Full check:

```bash
npm run check
```

Browser smoke:

1. Start a seeded floor with one known trap of each kind.
2. Search adjacent to a hidden trap; verify reveal and log.
3. Step onto each trap; verify effect, log, turn behavior, and render state.
4. Save/reload after revealing and after triggering a trap.
5. Verify keyboard-only play through trap reveal, trigger, inventory recovery,
   and stair travel.

## Balance strategy

The balance target is not "traps are harmless." The target is that traps change
plans without dominating deaths.

Initial tuning targets:

- A full 20-floor run generates roughly 8-14 traps.
- A player who rarely searches triggers roughly 3-6 traps in a run.
- A player who searches suspicious rooms triggers roughly 1-3 traps in a run.
- Direct trap damage accounts for less than 10 percent of total player damage in
  seeded random-walk simulations.
- No single trap can directly kill the player from above 1 HP in v1.
- Trap-associated deaths should usually involve a follow-up mistake or monster
  pressure, not only the trap trigger.

Add a small trap balance harness:

```ts
export interface TrapBalanceSummary {
  floors: Array<{
    floor: number;
    generated: number;
    byKind: Record<TrapKind, number>;
    hazardBudgetUsed: number;
  }>;
  runTotals: {
    generated: number;
    expectedTriggersNoSearch: number;
    expectedTriggersCautiousSearch: number;
    expectedDirectDamage: number;
    trapdoors: number;
    dartDrainStacks: number;
  };
}
```

Start with structural simulation:

- Generate 1,000 runs across floors 1-20.
- Track trap count, kind count, protected-room violations, and budget usage.
- Fail if any placement invariant breaks.

Then add behavioral simulation:

- Use a simple room-walker that visits rooms and samples a chance to search.
- Compare no-search, occasional-search, and cautious-search profiles.
- Record triggers, direct damage, forced descents, strength drain stacks, and
  time lost.

Finally do seeded manual playtests:

- early trap floor: floor 4 or 5
- first dart floor: floor 6 or 7
- first trapdoor floor: floor 8
- late dense floor: floor 16 or 17
- floor 19 with no trapdoors
- floor 20 with no traps

Balance gates before shipping:

- `npm run check` passes.
- 1,000-run generation simulation has zero placement violations.
- No simulated run sees more than one trapdoor.
- No generated floor exceeds its hazard budget.
- Manual keyboard-only smoke passes.
- Trap logs make the cause and recovery path clear.

## Acceptance criteria

- Hidden traps can be revealed by stepping on them or searching with `Space`.
- All five trap kinds exist and have distinct effects.
- Traps are persisted per floor and through save/restore.
- Traps do not appear before floor 4 or on floor 20.
- Trapdoors do not appear on floors 18-20.
- Start rooms, stair rooms, hero rooms, and boss rooms are trap-free.
- Hidden traps do not visually leak before reveal.
- A cautious keyboard-only player can detect and avoid traps.
- A non-searching player can still survive bad trap luck often enough that traps
  feel tense rather than arbitrary.
