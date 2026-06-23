# Monster Compendium & Modern AI Plan

Two related but independently shippable bodies of work:

- **Part 1 — Compendium of the Discovered.** Turn the bestiary from an always-complete
  catalogue into a progression artifact: only monsters the player has actually met are
  revealed, the rest stay a mystery, and discovered monsters get a small "cinematic"
  preview of how they look, move, and fight.
- **Part 2 — Modern AI for retro monsters.** Replace the single hardcoded chase/attack
  loop with a data-driven, parameterized behavior system that agents can author, that
  supports varied movement / attack / dodge styles, and that is tunable enough for a
  future automated balancer.

The parts are sequenced so Part 1 can land first on its own, while Part 1's _cinematic_
previews are designed to consume Part 2's behavior model (see
[Cross-cutting dependencies](#cross-cutting-dependencies)).

---

## Current state (shared context)

| Concern | Where | Today |
| --- | --- | --- |
| Monster data | `src/config.ts` `MONSTER_DATABASE` (~L172) | 35 templates: `{ symbol, name, hp, atk, color, minFloor, special? }` |
| Runtime monster | `src/types.ts` `Monster` | Template + `{ x, y, hp, maxHp?, frozenTurns, swipeTurn? }` |
| AI | `src/monster.ts` | `wanderMonster` + `processMonsterAI`: frozen-skip → wander-if-invisible → attack if adjacent → chase if `dist < aggroRange` → else wander. Marcus the Brave swipe is special-cased inline. |
| AI knobs | `src/config.ts` `BALANCE.monster` | `wanderSkipChance: 0.4`, `aggroRange: 6` |
| Combat | `src/combat.ts` | `computeStrike` (player), `computeMonsterDamage` (monster); scaling via `getScaledMonsterAtk` |
| Rendering | `src/ui.ts` | Canvas 2D glyphs; `Fx` kinds `strike/hit/dmg/death/freeze/phit`, `FX_LIFE` durations; shake + white-flash on hit; monsters **snap** between tiles |
| Compendium | `src/ui/components/Compendium.svelte`, `MonsterCard.svelte` | Modal showing **all** of `MONSTER_DATABASE`, searchable by name/symbol |
| UI state | `src/ui/store.svelte.ts` | `ui.compendiumOpen` + `actions.setCompendiumOpen` |
| Persistence | `src/config.ts` `loadConfig/saveConfig` | Only tunables, in `localStorage['rogue_config_tunables']`. No meta-progression. |

Key gaps this plan fills:

- There is **no notion of "discovered"** anywhere — the bestiary spoils every monster.
- AI is **one hardcoded path** with no per-monster variation beyond a name check, and its
  only tunable parameters are two numbers shared by all monsters.
- Monsters **teleport** between tiles; the animation layer has no movement, telegraph,
  ranged, or special-ability vocabulary.

---

# Part 1 — Compendium of the Discovered

## Goals

1. Only show monsters the player has encountered; keep the rest a mystery (locked cards).
2. Persist discovery across runs (it's meta-progression, not per-run state).
3. Give discovered monsters a small looping "cinematic" preview — idle, attack, and a
   sparring scene that shows their behavior — rendered with the same canvas/Fx tech as
   the game so it looks native.

## Discovery model

Discovery is **meta-progression**: it survives death and new runs, so it lives outside
`GameEngine` run state and persists like config does.

New module `src/discovery.ts`:

```ts
export type MonsterId = string; // stable slug; see "Stable ids" below

export interface DiscoveryState {
  version: 1;
  seen: Record<MonsterId, true>;        // entered the player's FOV at least once
  defeated: Record<MonsterId, true>;    // player has killed at least one
  killCount: Record<MonsterId, number>;
  firstSeenFloor: Record<MonsterId, number>;
}

export function loadDiscovery(): DiscoveryState;     // localStorage['rogue_discovery']
export function saveDiscovery(s: DiscoveryState): void;
export function recordSeen(s, id, floor): boolean;   // returns true if newly seen
export function recordDefeated(s, id): void;
```

Mirror the existing `loadConfig/saveConfig` pattern (try/catch JSON, merge over a default,
`version` field for forward migration). Keep a module-level singleton like
`currentTunables`.

### Discovery tiers (progressive reveal)

| Tier | Trigger | Card shows |
| --- | --- | --- |
| **Unknown** | never in FOV | Silhouette glyph, `???` name, hidden stats, `First appears: Floor ?` |
| **Seen** | entered FOV | Real glyph + color, name, "First seen: Floor N", HP/ATK as approximate bands ("Sturdy", "Deadly") |
| **Defeated** | killed ≥1 | Full exact stats, kill count, lore, **cinematic preview unlocked** |

Two tiers (seen / unknown) is the minimum that satisfies the request; the third
(defeated → cinematic + exact numbers) gives the feature its payoff and is recommended.

### Stable ids

`name` is currently unique and is already used as the `#each` key. Add an explicit
`id: string` slug to `MonsterTemplate` (e.g. `'orc'`, `'marcus-the-brave'`) so discovery
keys survive renames/rebalances. Until that migration lands, `name` is the interim key.

### Where discovery is recorded

- **Seen:** the engine already computes `visible[][]` (FOV) each turn. Add
  `recordSightings()` called right after FOV recompute: for every monster on a visible
  tile, `recordSeen(state, m.id, dungeonFloor)`. Persist (debounced) only when the set
  actually grows. Do **not** put this in `GameUI.paint` — discovery is game logic, not a
  render side effect.
- **Defeated:** in `GameEngine.playerAttack`, where a monster's HP hits 0 and it is
  removed, call `recordDefeated`.

## UI changes

### Store

Expose discovery to Svelte reactively:

```ts
// store.svelte.ts additions
discovery: DiscoveryState;                 // $state, hydrated on boot
// derived in components, not the store:
//   discoveredCount, totalCount, tier(monster)
```

`actions` gains nothing player-triggered here; the store just needs to re-read discovery
when the compendium opens (and after a kill, if we want live updates).

### `MonsterCard.svelte`

Drive presentation from a `tier` prop:

- `unknown` → render a **locked** variant: glyph replaced by a dimmed `?` or a
  same-shape silhouette (draw the glyph in `--text-dimmer` with no color), name `???`,
  stats hidden, optional floor hint. Locked cards still occupy the grid so the player can
  see how much of the bestiary remains.
- `seen` → name + glyph, coarse stat bands.
- `defeated` → today's full card + a "View" affordance that opens the detail/cinematic.

### `Compendium.svelte`

- Header gains a counter: `12 / 35 discovered`.
- Search filters **only discovered** monsters (you can't search for a name you don't
  know); locked cards are excluded from search results but shown when the query is empty.
- Sort: discovered first by `minFloor`, locked trailing (or interleaved by floor with the
  silhouette in place — decide during build; floor-ordered with silhouettes reads as a
  "fill-in-the-blanks" collection).

### Cinematic preview — `MonsterStage.svelte` + `MonsterDetail.svelte`

A new `MonsterDetail` modal (reuse `Modal.svelte`) opened from a defeated card. It hosts a
small dedicated canvas, `MonsterStage`, that renders a mini-arena and loops a scripted
performance using the **same drawing + Fx primitives** as `GameUI` so previews match the
in-game look exactly.

Factor the reusable bits out of `ui.ts` so both the game and the stage share them:

- `drawGlyph(...)` and the `Fx`/`FX_LIFE` system → move into something like
  `src/render/glyph.ts` + `src/render/fx.ts` (pure, canvas-context-in).
- `MonsterStage` instantiates its own tiny `FxLayer` and `requestAnimationFrame` loop.

Performance script (deterministic, seeded so it's identical every open):

1. **Idle** — monster glyph with a subtle bob / breathing pulse.
2. **Approach** — monster moves toward a dummy hero glyph using interpolated motion
   (the Part 2 tweening, not snapping).
3. **Attack** — plays the monster's signature attack: telegraph → lunge/projectile/
   breath → hit Fx on the dummy → recoil. Driven by the monster's **behavior profile**
   (Part 2). Until Part 2 exists, fall back to a generic melee strike using existing Fx.
4. **Special** — if the profile has a signature ability (steal, freeze, summon…), show it.
5. Loop.

This makes the cinematic literally a **headless run of the monster's AI** against a target
dummy — the same interpreter Part 2 builds, rendered on a stage. That keeps previews honest
(they show real behavior) and free of bespoke per-monster animation code.

## Implementation sequence (Part 1)

1. `src/discovery.ts` — state, load/save, record helpers, `version`.
2. Add `id` slug to every `MonsterTemplate`; add a `nameToId` fallback for old saves.
3. Engine: `recordSightings()` after FOV; `recordDefeated` on kill; debounced persist.
4. Store: hydrate `discovery`, expose tier helper.
5. `MonsterCard` locked/seen/defeated variants; `Compendium` counter + discovered-only search.
6. Extract `drawGlyph`/`Fx` into shared `src/render/*`; build `MonsterStage` + `MonsterDetail`
   with a **basic** idle+melee loop (no Part 2 dependency).
7. Upgrade the stage to play full behavior profiles once Part 2 lands.
8. Tests (below).

## Test plan (Part 1)

- `recordSeen` flips unknown→seen once, returns `true` only on first sight, and persists.
- `recordDefeated` sets defeated + increments `killCount`.
- Load/save round-trips; a malformed / older-version blob falls back to defaults without throwing.
- Compendium renders exactly the locked count for a fresh profile, and unlocks a card after
  a simulated sighting.
- Search returns no locked cards.
- Browser smoke: fresh profile shows all silhouettes; encounter a monster → its card
  unlocks; kill it → cinematic becomes available and plays.

## Acceptance criteria (Part 1)

- A brand-new player sees only silhouettes; every revealed card corresponds to a real
  encounter.
- Discovery persists across reload and new runs.
- The counter and locked/seen/defeated states stay correct after sightings and kills.
- Defeated monsters show a looping preview that visually matches in-game rendering.

---

# Part 2 — Modern AI for retro monsters

## Goals

1. Make monster behavior **data-driven and authorable** — an agent (or future tool) can
   design a new monster's AI by writing a JSON-serializable profile, no engine edits.
2. Support **varied behaviors** inspired by original Rogue's per-monster flags/specials,
   expanded for modern combat: movement styles, ranged/telegraphed attacks, dodging,
   fleeing, status abilities, multi-phase bosses.
3. Keep everything **parameterized and deterministic** so a future automated balancer can
   mutate numbers and measure outcomes via headless simulation.

## Design heritage

Original Rogue encoded behavior as per-monster flags (mean, flying, regenerates, greedy,
invisible, held, confused…) plus a handful of hardcoded specials (Nymph steals an item and
flees, Leprechaun steals gold, Aquator rusts armor, Ice monster freezes, Rattlesnake
weakens, Medusa confuses, Vampire drains, Dragon breathes fire). We keep that
"flags + special actions" spirit but replace bitfields and `switch` statements with a
**composable, parameterized behavior profile**.

## The behavior profile

A JSON-serializable `MonsterBehavior` referenced by id from a template
(`MonsterTemplate.behaviorId`). Absent/`'default'` reproduces today's chase-and-bite so the
existing 35 monsters keep working unchanged until intentionally re-authored.

```ts
// src/ai/types.ts
export interface MonsterBehavior {
  id: string;
  archetype?: ArchetypeId;            // preset this profile extends (see Archetypes)

  movement: {
    style: 'chase' | 'wander' | 'patrol' | 'ambush' | 'flee' | 'erratic' | 'stationary';
    cadence: number;                  // turns per move; <1 = acts faster than the player
    aggroRange: number;
    requiresLineOfSight: boolean;
    flying?: boolean;                 // ignores certain terrain
    keepDistance?: number;            // kiters hold this range (ranged/casters)
  };

  perception: {
    wakeOnSight: boolean;             // "mean": engages the instant it sees you
    wakeRange: number;
    loseInterestTurns: number;
  };

  attacks: AttackOption[];            // AI picks among the eligible ones
  defense: {
    dodgeChance: number;              // applied vs player strikes
    blockChance: number;
    retaliateChance?: number;
    fleeBelowHpPct?: number;          // 0..1; triggers flee state
  };

  abilities: Ability[];              // generalized Rogue "specials"
  reactions: Reaction[];             // triggered state changes

  anim: AnimProfile;                 // cues for in-game + cinematic preview
}

export interface AttackOption {
  id: string;
  kind: 'melee' | 'ranged' | 'breath' | 'special';
  range: number;
  damage: { scale: number; spread: number }; // multiplies getScaledMonsterAtk(base)
  windupTurns: number;               // telegraph; 0 = instant
  cooldown: number;
  weight: number;                    // selection bias when multiple are eligible
  effect?: StatusEffectSpec;         // freeze / confuse / drain / etc.
  animCue: AnimCueId;
}

export interface Ability {
  id: 'stealGold' | 'stealItem' | 'drainStat' | 'rustArmor' | 'freeze' | 'confuse'
    | 'split' | 'summon' | 'regenerate' | 'leechHeal' | 'teleport' | 'goInvisible';
  chance: number;
  magnitude?: number;
  cooldown: number;
  trigger?: 'onHit' | 'onHurt' | 'onEngage' | 'periodic';
}

export interface Reaction {
  when: 'onHurt' | 'selfLowHp' | 'playerLowHp' | 'allyDied';
  threshold?: number;
  effect: 'enrage' | 'flee' | 'callForHelp' | 'shieldUp' | 'phaseChange';
  params?: Record<string, number>;   // e.g. { atkMult: 1.5 }
}
```

**Every behavioral lever is a named number or enum** — there are no magic constants buried
in control flow. That is the property the automated balancer needs: the search space is
exactly the union of these fields plus `BALANCE`.

### Archetypes (authoring ergonomics)

Ship a registry of reusable presets in `src/ai/archetypes.ts` that profiles extend and
override:

| Archetype | Flavor |
| --- | --- |
| **Brute** | slow, high HP, telegraphed heavy melee (today's default + windup) |
| **Skirmisher** | fast, erratic, dodges, retreats after hitting (bats, eagles) |
| **Caster** | keeps distance, ranged attacks, summons |
| **Trickster** | steals gold/item then flees & may go invisible (nymph, leprechaun) |
| **Swarm** | weak, numerous, may `split` (worms) |
| **Ambusher** | stationary until you're close, then bursts (mimics, lurkers) |
| **Boss** | multi-phase via `phaseChange` reactions; signature specials |

An authored monster is usually `{ archetype: 'skirmisher', ...few overrides }`.

## Architecture: behavior interpreter

New `src/ai/brain.ts` replaces the body of `processMonsterAI`. It is **pure intent
generation** — it reads state and the profile, returns an `AIAction`, and mutates nothing:

```ts
export type AIAction =
  | { type: 'wait' }
  | { type: 'move'; dx: number; dy: number }
  | { type: 'attack'; attackId: string; targetX: number; targetY: number }
  | { type: 'ability'; abilityId: string }
  | { type: 'flee'; dx: number; dy: number };

export function decideMonsterAction(ctx: BrainContext): AIAction;
```

Per monster per turn:

1. **Perceive** — distance, line of sight, player status, own HP%.
2. **Transition state** — FSM: `asleep → alert → engaged → fleeing → enraged → dead`,
   driven by `perception` + `reactions`.
3. **Select action** — among eligible attacks (range + cooldown met) and movement style,
   weighted, using the existing seeded `RNG` for determinism.
4. **Return intent** — no mutation.

`GameEngine` (or a thin `applyAIAction`) resolves the intent: moves the monster, routes
damage through `combat.ts`, applies status effects, and **queues Fx**. Because the brain is
pure and deterministic, the **same brain runs headless** for the balancer and for Part 1's
cinematic stage.

Per-monster runtime state grows to hold the FSM:

```ts
// types.ts — Monster additions
ai?: {
  state: 'asleep' | 'alert' | 'engaged' | 'fleeing' | 'enraged';
  cooldowns: Record<string, number>;
  cadenceCounter: number;
  lastSeenTurn: number;
  phase?: number;
};
```

## Combat integration (dodge / block / telegraph)

Extend `src/combat.ts` and `BALANCE.combat`:

- **Telegraphed attacks:** an attack with `windupTurns > 0` first emits a telegraph (no
  damage), giving the player a window to step away — the modern "dodge by positioning"
  loop. If the target left the attack's range/line when the windup resolves, it whiffs.
- **Monster dodge/block:** in `playerAttack`, before applying `computeStrike`, roll the
  monster's `defense.dodgeChance` / `blockChance` (mirrors the player's own evasion if/when
  added). All chances are profile fields, defaulting to 0 so current monsters are unchanged.
- Keep `computeMonsterDamage`; `AttackOption.damage.scale/spread` feed its inputs so the
  scaling/tunable pipeline (`getScaledMonsterAtk`) still applies.

## Animation system expansion

The request explicitly wants "better animation techniques." Today monsters snap between
tiles and the Fx vocabulary is melee-only. Additions (rendering-agnostic so glyphs can
later become sprites):

- **Position interpolation:** tween a monster from its old tile to its new tile over
  ~`FX_LIFE`-scale ms instead of snapping. This single change makes movement read as
  animation. Store `prevX/prevY + moveStart` and lerp in `paint`.
- **New `Fx` kinds:** `windup` (pulsing telegraph at target tiles), `lunge`/`dash`
  (squash-stretch toward target), `projectile` (glyph traveling tile→tile), `breath`
  (cone/line sweep), `cast`/`summon`, `dodge` (sidestep), `enrage` (color flash),
  `flee`. Add matching `FX_LIFE` entries.
- **`AnimProfile` / `AnimCueId`:** each behavior names the cue it plays, so in-game combat
  and the cinematic preview stay in sync from one source of truth.

## Balancing hooks (foundation for the future automated balancer)

Because profiles are pure data and the brain + combat are deterministic, add a **headless
simulation harness** (`src/ai/sim.ts`, no canvas):

- Run N seeded duels of `behaviorId` vs. a modeled player at a given level/gear.
- Report win rate, median turns-to-kill, avg damage dealt/taken, ability proc rates.
- Output is the fitness signal a future balancer optimizes; the search space is the
  profile's numeric fields plus `BALANCE`. This plan only builds the **harness + metrics**;
  the optimizer itself is explicitly future work.

## Implementation sequence (Part 2)

1. `src/ai/types.ts` — behavior, attack, ability, reaction, `AIAction` schemas.
2. `src/ai/archetypes.ts` — preset registry; a `'default'` archetype byte-for-byte matching
   today's behavior.
3. Add `behaviorId` + `id` to templates; map all 35 monsters to archetypes (most → `default`/
   `brute`, with a few showcase re-authors: bat→skirmisher, nymph→trickster, etc.).
4. `src/ai/brain.ts` — interpreter (perceive → FSM → select → intent), seeded RNG.
5. Refactor `processMonsterAI` to: `decideMonsterAction` → `applyAIAction`. Preserve current
   numbers for `default` so balance is untouched until profiles change.
6. Combat: telegraph resolution + monster dodge/block; wire `AttackOption` damage.
7. Animation: position interpolation + new `Fx` kinds + `AnimProfile`.
8. Abilities: implement steal/freeze/confuse/summon/split/drain/regenerate/teleport/invisible
   against engine state.
9. `src/ai/sim.ts` headless harness + metrics.
10. Feed profiles into Part 1's `MonsterStage` cinematic.
11. Tests (below).

## Test plan (Part 2)

- `default` archetype reproduces legacy AI: given identical seed + map, monster
  positions/damage match the pre-refactor `processMonsterAI` (golden test).
- Interpreter unit tests per archetype: skirmisher retreats after hitting; caster holds
  `keepDistance`; trickster steals then flees; ambusher stays until `wakeRange`.
- Telegraph: stepping out of range during windup causes a whiff; staying takes the hit.
- Dodge/block rolls reduce/avoid player damage at the configured rate (statistical, seeded).
- Abilities mutate the right state (gold/inventory/status/monster count) with correct
  chance + cooldown.
- `sim.ts` is deterministic for a fixed seed and produces stable metrics.

## Acceptance criteria (Part 2)

- A new monster's full AI can be defined as data (archetype + overrides) with **zero**
  engine changes.
- At least the showcase set demonstrates distinct movement, a telegraphed/ranged attack,
  dodging, fleeing, and a steal/summon special.
- Existing monsters play identically until their profiles are intentionally changed.
- Every behavioral value is a named parameter reachable by the sim harness.
- Monsters animate (interpolated movement + behavior-specific Fx) rather than snapping.

---

## Cross-cutting dependencies

- **Stable `id` slugs** on `MonsterTemplate` are shared infrastructure for both parts — add
  them once, early.
- **Shared render primitives:** extracting `drawGlyph` + the `Fx` system out of `ui.ts`
  (Part 1, step 6) is what lets the cinematic stage and the expanded in-game animations
  (Part 2, step 7) share one implementation.
- **Behavior model feeds the cinematic:** Part 1 ships a basic idle+melee preview without
  Part 2; the _full_ cinematic (real behavior, specials) is Part 1 step 7 gated on Part 2.

## Suggested order of delivery

1. Shared: `id` slugs + extract render primitives.
2. Part 1 discovery + locked cards + basic cinematic (high value, low risk, no AI work).
3. Part 2 schema + archetypes + interpreter + `default` parity refactor.
4. Part 2 combat/animation/abilities + sim harness.
5. Upgrade Part 1 cinematic to play full profiles.

## Out of scope (named future work)

- The automated balancer's optimizer (this plan builds only the parameterization + metrics).
- Swapping glyphs for sprite art (the animation layer is built to allow it later).
- Sharing/exporting authored behavior profiles between players.
