# Monster Authoring Guide

How to design, implement, balance, and ship a monster's behavior — everything an
agent needs to take a monster from idea to merged, without reading the whole
codebase first. Written so several agents can work on different monsters in
parallel (see [Parallel work](#parallel-work--avoiding-conflicts)).

> TL;DR: a monster's AI is **data** — pick an archetype (or write one) in
> `src/ai/archetypes.ts`, assign it to the monster by id, vet the difficulty with
> the balance harness (in-game **Ctrl/Cmd+B**), add a couple of tests, run
> `npm run check`. The in-game animation and the bestiary cinematic update
> themselves from the behavior profile — you usually write zero rendering code.

---

## Mental model

- **Behavior is declarative.** Monsters don't contain logic; they reference a
  `MonsterBehavior` profile (movement + attacks + defense + abilities). A pure
  interpreter turns that profile into an action each turn; the engine applies it.
- **The `default` archetype reproduces the original chase-and-bite exactly**,
  including RNG draw order, so any monster you don't touch is unchanged.
- **Every behavior knob is a named number**, so the balance harness can simulate
  a monster's difficulty and even solve for the attack value that hits a target.
- **Animation is derived, not authored.** Movement interpolation, the telegraph
  for windup attacks, the evade wobble, the dive streak, and the bestiary
  "combat lifecycle" cinematic all read the behavior profile. Adding a monster
  rarely means touching canvas code.

---

## Architecture map

| File | What it owns |
| --- | --- |
| `src/ai/types.ts` | The behavior schema (`MonsterBehavior`, `MovementSpec`, `AttackSpec`, `AbilitySpec`, `DefenseSpec`), `AIAction`, runtime state. **Read this first.** |
| `src/ai/archetypes.ts` | `ARCHETYPES` registry, `MONSTER_ARCHETYPE` (id → archetype assignment), `resolveBehavior`, `primaryAttackShape`/`shapeForTemplate` (the bridge to the harness). **You will edit this for almost every monster.** |
| `src/ai/brain.ts` | The pure interpreter `decideMonsterAction(ctx) → AIAction`. Movement styles, attack selection, FSM (asleep/hunting/fleeing), windup emission. Edit only when adding a **new movement style or decision rule**. |
| `src/monster.ts` | `processMonsterAI` (the per-turn loop), applies actions, resolves telegraphed attacks, fires on-hit abilities (`applyOnHitAbilities`/`fireAbility`). Edit only when adding a **new ability effect** or attack-resolution rule. |
| `src/engine.ts` | Calls `processMonsterAI`; rolls monster **evasion** in `executeStrike`; passes the AI's Fx hooks. |
| `src/ai/sim.ts` | Combat model: analytic expected damage/threat/TTK + seeded Monte-Carlo duel. |
| `src/ai/balance.ts` | Reference player curve, `analyzeMonster`/`balanceReport`/`curveReport`, the `autoBalanceAttack` bisection solver, `formatBalanceReport`. |
| `src/ai/stats.ts` | Pure math (Wilson CI, expectations, quantiles). You won't touch this. |
| `src/config.ts` | `MONSTER_DATABASE` (the monster stat rows: `symbol`, `name`, `hp`, `atk`, `color`, `minFloor`, `special?`). Edit to change base stats. |
| `src/render/stage.ts` | The bestiary cinematic. Reads a `StageBehavior` (`attackKind`/`hasEvasion`/`erratic`) derived from the profile. Edit only to add a **new cinematic beat**. |
| `src/ui.ts` | The dungeon renderer. Owns the Fx vocabulary (telegraph, dive, whiff, evade wobble, float labels) and monster glide interpolation. Edit only to add a **new Fx**. |
| `src/discovery.ts` | `monsterId()` — the stable id slug (a kebab-case of the name) used as the archetype-assignment key. |

---

## The behavior schema (reference)

From `src/ai/types.ts`. A `MonsterBehavior` is `{ id, movement, attacks[], defense, abilities[] }`.

### MovementSpec

```ts
movement: {
  style: 'hunt' | 'erratic' | 'ambush' | 'kite' | 'flee' | 'stationary',
  aggroRange: number,        // distance at which a hunter starts chasing
  wakeRange?: number,        // ambusher: distance that wakes it (defaults to aggroRange)
  erraticChance?: number,    // erratic: chance/turn to hop randomly vs chase (default 0.5)
  keepDistance?: number,     // kite: tiles of spacing it tries to hold
}
```

| Style | Behavior |
| --- | --- |
| `hunt` | Stationary outside `aggroRange`, beelines (X-then-Y) within it. The legacy behavior. |
| `erratic` | Wobbles toward you — random hops mixed with chase steps. Plus **hit-and-run**: after its primary attack fires (on cooldown) and you're close, it peels away. |
| `ambush` | Holds perfectly still until you enter `wakeRange`, then hunts **permanently** (latches). |
| `kite` | Retreats when you're closer than `keepDistance`, closes when farther, holds at range to attack. Spacing takes priority over a free shot. |
| `flee` | Always runs away. Usually reached via the `fleeing` FSM state, not set directly. |
| `stationary` | Never moves (turrets). |

`BALANCE.monster.aggroRange` (currently 6) is the shared default; archetypes use `AGGRO` / `AGGRO + 1` etc.

### AttackSpec

```ts
attacks: [{
  id: string,               // unique within the behavior, e.g. 'melee', 'swoop', 'bolt'
  range: number,            // Manhattan range it can land (1 = melee, >1 = reach/ranged)
  damageMultiplier: number, // scales the monster's atk roll for this attack
  windupTurns: number,      // 0 = instant; >0 = TELEGRAPHED (see below)
  cooldown: number,         // turns it must rest after firing
  weight: number,           // selection bias when several attacks are eligible
  swipeAlternates?: boolean,// every other use deals 2× (Marcus's swipe)
  animCue?: 'melee' | 'swoop',
}]
```

The brain picks the **highest-weight eligible** attack whose `range >= dist` and
whose cooldown has elapsed.

**Telegraphed attacks (`windupTurns > 0`) are the core "modern" mechanic:**
- The monster commits to your **current tile** and shows a pulsing target-lock
  for `windupTurns` turns. It deals damage on resolve **only if you're still on
  that tile** — step off and it whiffs (positional dodge). While committed the
  monster takes no other action.
- This is automatic: the engine (`resolvePendingAttack` in `src/monster.ts`)
  handles the lock, the dodge check, and the dive/whiff Fx. You only set
  `windupTurns`/`range`/`damageMultiplier`.
- A long-range telegraphed attack reads as a **projectile** (the dive streak
  flies from the monster to your tile) — that's how kiters/casters work today.

### DefenseSpec

```ts
defense: {
  dodgeChance?: number,     // 0..1 chance to flit aside and negate a player strike (evasion)
  fleeBelowHpPct?: number,  // 0..1 HP fraction below which it switches to fleeing
}
```

Evasion is rolled in `engine.executeStrike` and only draws RNG when
`dodgeChance > 0`, so it's free of side effects for non-evasive monsters.

### AbilitySpec (on-hit "specials")

```ts
abilities: [{
  id: 'stealGold' | 'stealItem' | 'freeze' | 'drainStrength' | 'summon' | 'leechHeal',
  chance: number,           // probability it fires when its trigger occurs
  magnitude?: number,       // gold stolen, HP leeched, turns frozen, …
  cooldown: number,
  trigger: 'onHit',         // 'onEngage' is reserved; only 'onHit' is wired today
  thenFlee?: boolean,       // flip to fleeing after firing (nymph/leprechaun)
}]
```

**Implemented today** (in `fireAbility`, `src/monster.ts`): `stealGold`,
`leechHeal`. The rest (`stealItem`, `freeze`, `drainStrength`, `summon`) are
**schema-only** — they're accepted but do nothing until you add a `case` to
`fireAbility`. See [Adding a new ability](#adding-a-new-ability-effect).

---

## Recipe: add a monster behavior

The common case — give an existing monster a distinct, balance-checked behavior.

> **Fast path:** if a fitting archetype already exists *and* it's complete (its
> abilities are already implemented in `fireAbility`), the entire change is **one
> line** in `MONSTER_ARCHETYPE` (step 2) plus tests (step 4) and the harness check
> (step 3). Skip step 1. The Leprechaun → `trickster` is exactly this: the
> archetype, the `stealGold` ability, and the engine support all pre-exist, so
> the diff is a single assignment line. Don't over-build.

### 1. Pick or write an archetype (`src/ai/archetypes.ts`)

Reuse one of the presets if it fits: `skirmisher` (erratic), `ambusher`,
`brute` (slow heavy telegraph), `kiter` (ranged), `trickster` (steal + flee),
`bat` (erratic + telegraphed swoop + evasion). Otherwise add a new entry to
`ArchetypeId` and `ARCHETYPES`. Use the `melee()` helper for sane defaults:

```ts
// e.g. a dive-bombing raptor
raptor: {
  movement: { style: 'erratic', aggroRange: AGGRO + 2, erraticChance: 0.4 },
  attacks: [melee({ id: 'dive', range: 2, damageMultiplier: 2.5, windupTurns: 1, cooldown: 1, animCue: 'swoop' })],
  defense: { dodgeChance: 0.15 },
  abilities: [],
},
```

### 2. Assign it to the monster by id (`MONSTER_ARCHETYPE`)

The key is the monster's **id slug** = `monsterId(template)` = kebab-case of the
name (`"King Cobra"` → `"king-cobra"`, `"Marcus the Brave"` → `"marcus-the-brave"`).

```ts
export const MONSTER_ARCHETYPE: Record<string, ArchetypeId> = {
  'brown-bat': 'bat',
  'eagle': 'raptor',   // ← your assignment
  ...
};
```

If unsure of the slug, check the monster's `name` in `MONSTER_DATABASE`
(`src/config.ts`) and slugify it, or `import { monsterId } from './discovery'`.

### 3. Vet the difficulty with the harness (do NOT skip)

> **⚠ The #1 tuning gotcha — telegraphed vs movement-only archetypes.** The base
> `atk` values in `MONSTER_DATABASE` are tuned for **plain melee that hits every
> turn**. Two cases:
> - **Movement-only archetypes** (`ambusher`, `skirmisher`) keep plain-melee
>   combat, so they're **balance-neutral** — the monster's threat is unchanged.
>   Just *confirm* it's still fair; **do not bump atk**.
> - **Telegraphed / gated archetypes** (`brute`, `bat`, `raptor`, `kiter`, and
>   anything with `windupTurns > 0`) only connect **~0.3×/turn** (windup downtime
>   × the assumed dodge rate). That gating *more than cancels* a `>1` damage
>   multiplier, so the monster will read **easy** at its current base atk. Expect
>   to **roughly double (or more) the base `atk`** in `MONSTER_DATABASE` to reach
>   the fair band. The displayed atk is therefore **not comparable across
>   archetypes** — a telegraphed slammer needs a bigger number than a plain-melee
>   monster of the same floor to land the same threat. (Examples: Eagle→raptor
>   needed atk 12→17; Cyclops→brute needed 43→75.)

A combat-affecting archetype changes the monster's effective damage. Check it
stays in the **fair** band before shipping. Two ways:

- **In-game:** press **Ctrl/Cmd+B** to open the Balance Report. Find your
  monster; aim for `difficulty: fair` (threat ~0.35–0.70) at the floor it first
  appears. Elites (`↑` variants) can sit a bit higher.
- **Headless** (for precise tuning): write a throwaway in `src/ai/` and run it
  with **`npx tsx src/ai/scratch.ts`** (plain `node` won't run TypeScript/ESM
  imports). Or — cleaner — make it a real test that asserts the fair band, like
  the harness test in `src/ai/leprechaun.test.ts`, and run it with `npx vitest`.

  ```ts
  import { analyzeMonster } from './balance';
  import { shapeForTemplate } from './archetypes';
  import { MONSTER_DATABASE } from '../config';
  const t = MONSTER_DATABASE.find(m => m.name === 'Eagle')!;
  console.log(analyzeMonster(t, { trials: 2000, shapeFor: shapeForTemplate }));
  ```

  `analysis.threat` is the deterministic closed-form number (no MC variance) and
  drives `difficulty`; the `winRate`/`meanTtk` fields are the Monte-Carlo extras.
  Tune the archetype's `damageMultiplier` (and/or the monster's base `atk` in
  `MONSTER_DATABASE`) until `analysis.threat` lands in band — **anywhere inside
  [0.35, 0.70] is done.** Only adjust if it falls *outside* the band; don't chase
  a specific number. To **solve** for a target instead of guessing (useful for
  telegraphed/heavy attacks where you're picking a multiplier), use
  `autoBalanceAttack` (monotonic bisection):

  ```ts
  import { autoBalanceAttack, expectedPlayerAtFloor, monsterCombatFromTemplate } from './balance';
  const player = expectedPlayerAtFloor(t.minFloor);
  const mc = monsterCombatFromTemplate(t, shapeForTemplate(t));
  autoBalanceAttack(mc, player, { threat: 0.4 }); // → { damageMultiplier, achievedThreat, ... }
  ```

  Delete the throwaway before committing (or write it as a real test — see below).

### 4. Tests (`src/ai/brain.test.ts` or a new file)

Lock the resolved kit and any new decision logic. Minimum:

```ts
it('resolves Eagle to the raptor archetype', () => {
  const b = resolveBehavior({ name: 'Eagle' });
  expect(b.id).toBe('raptor');
  expect(b.attacks[0].windupTurns).toBeGreaterThan(0);
});
```

If you added a new movement style or ability, test it through
`processMonsterAI` (see the telegraph hit/whiff tests and the
`applyOnHitAbilities` tests in `brain.test.ts` for the pattern — use
`makeRng(seed)` and a `floorMap(n)` of `TILE.FLOOR`).

### 5. Verify

```
npm run check     # svelte-check (types) + vitest (all tests)
```

Then playtest: find the monster in the dungeon, and open its bestiary entry
(press `m`, then a **defeated** monster) to watch the cinematic reflect the new
kit. The cinematic auto-derives from the profile — no extra work.

---

## How the cinematic & animation follow the profile

You generally **do not** write rendering code. Here's what's automatic:

- **In dungeon:** monsters glide between tiles; telegraphed attacks show the
  target-lock + dive streak; evasion shows the flit-aside wobble + "dodge"
  label; whiffs show a dust puff. All driven by `windupTurns`, `dodgeChance`,
  and the engine's resolution.
- **Bestiary cinematic** (`src/render/stage.ts`): `MonsterStage.svelte` derives a
  `StageBehavior` from `resolveBehavior(monster)`:
  - `attackKind: windupTurns > 0 ? 'telegraph' : 'melee'`
  - `hasEvasion: defense.dodgeChance > 0`
  - `erratic: movement.style === 'erratic'`

  The lifecycle (encounter → signature attack → hero's 3 strikes → evasion on
  the first → HP drain → death → respawn) renders from those flags. A new
  archetype shows the right preview for free.

**When you DO touch rendering:** only if you want a *new visual cue* distinct
from melee/swoop (e.g. a breath cone). Add an `animCue` value in `types.ts`, an
`Fx` kind + draw method in `ui.ts`, emit it from `resolvePendingAttack`/
`applyAttack` in `monster.ts`, and optionally a stage beat in `stage.ts`.

---

## Adding a new ability effect

1. Add the `id` to the `AbilityId` union in `src/ai/types.ts` (if new).
2. Add a `case` in `fireAbility` (`src/monster.ts`) that mutates `m`/`player`
   and pushes a log line. Keep it pure-ish — it's called from
   `applyOnHitAbilities`, which already handles the `chance` roll and `thenFlee`.
3. If the ability changes the player's effective power in a way the harness
   should model (e.g. `drainStrength` lowers player DPS), reflect it in the
   combat model — but most on-hit specials (steal gold, freeze) don't change the
   damage race and need no harness change.
4. Test it directly: `applyOnHitAbilities(behavior, m, player, makeRng(1))` with
   `chance: 1` and assert the mutation + log.

**Gotchas for non-trivial abilities (learned implementing `stealItem`/`leechHeal`):**
- **`fireAbility` has no `rng`.** The `chance` roll is consumed upstream in
  `applyOnHitAbilities`; the effect itself runs with no RNG. So any "random"
  choice inside an ability must be **deterministic** (e.g. take `potions[0]`, not
  a random potion) — adding a random draw here would desync seeded runs. If you
  genuinely need randomness, thread `rng` through and account for the parity gotcha.
- **Don't corrupt equipped state when touching inventory.** `player.inventory`
  buckets are `{ food, weapons[], potions[] }` + per-armor-slot arrays
  (`helm/chest/legs/gauntlets/boots`, plus `shield`), and `player.equipped` holds
  **indices** into those arrays. Removing a weapon/armor element shifts every later
  index and mis-points equipped gear. `potions: PotionType[]` carries no indices,
  so it's the safe bucket to steal from. See `Inventory`/`Equipped` in `types.ts`.
- **The harness models only damage, evasion, and telegraph cadence** — not
  healing, stat-drain, steal, freeze, or summon. So an ability that changes the
  *attrition* of a fight (e.g. `leechHeal`) is **not vettable by the harness**:
  tune its direct damage to fair as usual, then set the ability's magnitude
  conservatively by playtest, and say so in a comment.

---

## The balance harness in one screen

- **Threat** = fraction of the reference player's HP spent killing the monster
  at the floor it first appears. Target band **[0.35, 0.70]** = "fair"
  (`DEFAULT_BANDS` in `balance.ts`).
- **Win% stays ~100%** even for fair monsters — that's expected. The model is a
  1-v-1 duel with reference gear; real lethality comes from multiple monsters +
  hunger + being under-geared. **Threat (HP spent) is the signal that moves**,
  not win-rate.
- The **reference player curve** (`DEFAULT_CURVE`: level≈floor, linear gear) is a
  *modeling assumption*, not measured truth. If playtest feel disagrees with the
  panel, the curve is what to recalibrate — flag it, don't over-tune monsters to
  it.
- `primaryAttackShape` is the bridge: it folds `windupTurns`/`cooldown` into an
  effective hits-per-turn (×0.6 `TELEGRAPH_CONNECT` for telegraphed attacks, on
  the assumption the player dodges ~40%), `swipeAlternates` into ×1.5 damage, and
  passes `dodgeChance` through (evasion lowers the player's effective DPS).
- Bosses (`special: 'boss'`) are excluded from `balanceReport` by default — their
  huge HP pools don't fit the per-turn threat metric. Tune them by playtest.

See `guides/`-adjacent memory and the `balance` commit message for the
methodology behind the current base tuning.

---

## Gotchas (read before you ship)

1. **RNG parity / determinism.** The game is seeded and reproducible. Only draw
   from `rng` when you must, and only for the monster that needs it — e.g.
   evasion is gated on `dodgeChance > 0` so non-evasive monsters draw nothing and
   stay byte-identical. If you add a per-turn random roll to a shared path,
   you'll desync every seeded run and break the `default`-parity tests.
2. **`resolveBehavior` is memoized** (`resolved` Map keyed by id). If you mutate
   `MONSTER_ARCHETYPE` at runtime in a test, do it **before** the first
   `resolveBehavior` call for that id. Tests that inject `MONSTER_ARCHETYPE['x']`
   then build a monster named to slug to `'x'` work (see the telegraph tests).
3. **Telegraph turn accounting.** `resolveTurn = turn + max(1, windupTurns)`;
   resolution fires when `turn >= resolveTurn`. With `windupTurns: 1` the player
   gets exactly one move to dodge. Don't set `windupTurns: 0` and expect a
   telegraph — 0 means instant.
4. **Scale-then-round order.** The engine computes damage as
   `getScaledMonsterAtk(round(atk * damageMultiplier))`. `monsterCombatFromTemplate`
   matches this order so the harness is bit-exact. If you compute effective atk
   anywhere else, use the same order.
5. **The `id` slug is the contract.** Discovery, archetype assignment, and the
   compendium all key on `monsterId()`. A spawned `Monster` carries `id` from its
   template via object spread — if you add an explicit `id` to a template, it
   flows through; if a future spawn path stops spreading, sightings/kills would
   key by the name slug and silently mismatch. Keep them in sync.
6. **Schema-only abilities do nothing.** `stealItem`/`freeze`/`drainStrength`/
   `summon` are valid in the schema but no-op until you add them to `fireAbility`.
   Don't assign them expecting an effect.
7. **Ranged attacks don't move the monster.** A `kite`/telegraphed ranged attack
   commits and resolves in place; the dive streak conveys the projectile. If you
   want the monster to also reposition, that's movement (handled between attacks),
   not the attack itself.
8. **Bosses & the `'hero'` special.** `special` is `'hero' | 'boss'`. Boss-tagged
   monsters are excluded from the default balance report and drive victory
   conditions; don't repurpose the flag for flavor.
9. **`npm run check` runs `svelte-check` first.** It catches type errors the
   tests miss (e.g. a stale identifier in a code path the tests don't execute).
   Always run the full `check`, not just `vitest`.

---

## Parallel work — avoiding conflicts

Most of a monster's changes land in **shared files** (`archetypes.ts`,
`brain.test.ts`, `config.ts`), so naive parallel edits will merge-conflict. To
run several agents at once:

- **Give each agent its own git worktree/branch.** Pure archetype assignments are
  small, localized diffs that merge cleanly even when two agents both touch
  `archetypes.ts` (different entries / different `MONSTER_ARCHETYPE` lines).
- **One archetype + one assignment per monster.** Keep each agent's edit to: a new
  `ARCHETYPES` entry, its `ArchetypeId` union member, one `MONSTER_ARCHETYPE`
  line, optional `MONSTER_DATABASE` atk tweak, and tests. That's the conflict
  surface — small and rarely overlapping.
- **Put new tests in a per-monster file** (e.g. `src/ai/eagle.test.ts`) instead of
  all appending to `brain.test.ts`, to avoid test-file conflicts.
- **Serialize core changes.** Editing shared logic — a **new movement style**
  (`brain.ts`), a **new ability effect** (`monster.ts` `fireAbility`), or a **new
  Fx/animCue** (`ui.ts`/`stage.ts`/`types.ts`) — touches hot files every agent
  depends on. Land these one at a time (or have a single "core" agent own them)
  before the parallel monster work that uses them.
- **Each agent runs `npm run check` on its own branch** and tunes via the harness
  independently; threat is computed per-monster so there's no cross-talk.

---

## Suggested next monsters

Grounded in the current `MONSTER_DATABASE`. Each is mostly an archetype
assignment + harness tuning; the noted gotcha is the thing to watch.

| Monster (floor) | Archetype | Effect & flavor | Difficulty target | Gotcha |
| --- | --- | --- | --- | --- |
| **Leprechaun** (5) | `trickster` | Steals gold on a hit, then flees — canonical Rogue. | Fair, but fleeing lowers its uptime → it'll read *easier* than its threat number. | **Already shipped** (threat 0.386, fair, at base stats — a 1-line assignment, no tuning). `stealGold` is implemented. Flee makes the harness slightly overstate threat (it doesn't model the monster leaving), so leaving it at the low end of fair is correct. |
| ~~**Eagle** (4)~~ ✅ shipped | `raptor` (new) | Telegraphed dive + light evasion — gentler bat cousin. | Fair (0.375 @ F4). | Telegraph-gated → base atk bumped 12→17 (see the §3 gotcha). |
| ~~**Cyclops / Colossal Cyclops** (17)~~ ✅ shipped | `brute` | Heavily telegraphed slam — dodge or eat a big hit. | Fair (0.48 / 0.61). | Telegraph-gated → atk bumped 43→75 / 45→85 (see the §3 gotcha). |
| ~~**Golem / Gary** (15)~~ ✅ shipped | `ambusher` | Stone sentinel, inert until you're close, then latches. | Fair (0.49 / 0.58). | Movement-only → **balance-neutral, no tuning** (threat unchanged vs default). |
| ~~**Flying Serpent** (16)~~ ✅ shipped | `kiter` | Spits telegraphed bolts from range; strafe off its line. | Fair (0.42). | Telegraph-gated → atk 42→85; also retuned the stock `kiter` bolt (cooldown 1→0, mult 0.8→1.2) which was trivial. The dive streak doubles as the projectile. |
| ~~**Zombie / Zachary** (19)~~ ✅ shipped | `leech` (new) | Bite heals it — attrition pressure. | Fair direct (0.54 / 0.62). | `leechHeal` magnitude is **playtest-only** — the harness has no healing term. Kept conservative (3 HP/hit); bump for more bite. |
| ~~**Nymph** (9)~~ ✅ shipped | `nymph` (new) | Steals a potion and vanishes. | Fair (0.42). | Implemented `stealItem` in `fireAbility` (steals a potion — the equip-index-safe bucket; gold fallback; deterministic). |

**Shipped so far** (all the table's suggestions): Leprechaun (trickster), Eagle
(raptor), Cyclops + Colossal Cyclops (brute), Golem + Gary (ambusher), Flying
Serpent (kiter), Zombie + Zachary (leech), Nymph (stealItem). Archetypes now
live: default, skirmisher, ambusher, brute, kiter, trickster, bat, raptor,
leech, nymph, boss-swiper. For the next wave, mine the remaining roster
(Hobgoblin, King Cobra, Indus Worm, Pygmy, Rabid Ostrich, Minotaur, Unicorn,
Yeti, Troll, Quinotaur, Xelhua, Apperation, Dragon, …) — most can reuse a live
archetype (a 1-line assignment + harness check), and the still-unimplemented
abilities (`freeze`, `drainStrength`, `summon`, `stealItem` variants) are the
natural new-archetype candidates.

---

## Definition of done

- [ ] Archetype defined/chosen and assigned in `MONSTER_ARCHETYPE` by correct id slug.
- [ ] Difficulty checked in the Balance Report (Ctrl/Cmd+B) — `fair` at its floor (elites may be higher).
- [ ] Tests: resolved kit asserted; any new movement/ability/Fx covered through `processMonsterAI`.
- [ ] `npm run check` is green (types + all tests).
- [ ] Playtested in the dungeon, and the **bestiary cinematic** reflects the new kit.
- [ ] If you added core logic (movement style / ability / Fx), it's documented here and landed before dependent monster work.
```
