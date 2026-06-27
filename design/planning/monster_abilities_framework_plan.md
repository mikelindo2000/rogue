# Monster Abilities Framework — the Player Status-Effect Spine

Adds the missing layer that lets the GM-sheet monster abilities (the "Ability 1 / Ability 2"
columns) become **data** instead of bespoke engine code. This doc designs the *spine* — a
player-side status-effect system — using the **Brown Bat → Poisonous Puke** ability as the
driving vertical slice. Abilities, drops, and weaknesses are sequenced after; this plan is
the abilities foundation only.

**Constraint (explicit):** no balance changes. HP / ATK / spawn floors in `MONSTER_DATABASE`
stay frozen. On-hit abilities are already balance-harness-neutral (the sim models only the
primary attack's DPS — see `src/ai/archetypes.ts` `primaryAttackShape`), so this whole layer
sits *outside* the balance model by construction.

---

## Where we are

The sheet defines, per monster, **Ability 1 (3% on hit)** and **Ability 2 (1% on hit)**. We
categorized all of them (see [Effect taxonomy](#effect-taxonomy)). The engine already has the
*trigger* socket for them — `AbilitySpec` with `chance` + `trigger: 'onHit'`, dispatched by
`applyOnHitAbilities` → `fireAbility` in `src/monster.ts`. Three abilities are fully wired
(`stealGold`, `stealItem`, `leechHeal`); the chance model maps cleanly (`chance: 0.03 / 0.01`).

What's missing is **somewhere for an ability's effect to live on the player across turns**, and
**read sites** that honor it. Today that state is scattered and effect-specific:

| Container | File | Holds | Pattern |
| --- | --- | --- | --- |
| `StatusEffects` | `types.ts` | player **buffs** (vigor, midas, strength, invis, armor, detection) | one `xTurns: number` per effect; decremented in `engine.processTurn` (~L2336) |
| `TrapEffects` | `types.ts` | player **debuffs** from traps (`bearTrapTurns`, `sleepTurns`, `strengthDrained`, `confusedTurns`) | same per-field timer pattern |
| `player.disarmedHits` | `types.ts` `Player` | weapon-disarm counter, read by `computeStrike({ disarmed })` | a count, decremented on use |
| `monster.frozenTurns` | `Monster` | the only *monster*-side status | skipped in `processMonsterAI` |

**The important discovery:** a large fraction of the sheet's abilities already have a working
precedent in `TrapEffects`:

- **Stun / lost turn** (Intimidating Stare, Stomp, Freeze Frame, Iron Curse…) ≈ `sleepTurns` (skip the player's turn).
- **Fear / loss of control** (Giantfolk Growl, Ingest Spirit Dust) ≈ `confusedTurns` (randomized movement).
- **Damage-output debuff** (Maggot Infestation) ≈ `strengthDrained`; weapon-disarm ≈ `disarmedHits` (`computeStrike` already halves damage when `disarmed`).
- **Immobilize** ≈ `bearTrapTurns`.

So the framework is mostly **unifying machinery that already exists** plus a few genuinely-new
primitives: **damage-over-time** (poison/fire/acid — the Bat's slice), **miss-chance** (blind),
**armor debuff**, and **magic-silence**.

---

## Effect taxonomy → read site → status today

Every sheet ability resolves to one of these effect *kinds*. The framework's job is to make
each kind (a) persist on the player and (b) be honored at its read site.

| Kind | Sheet examples | Read site (where it's honored) | Exists? |
| --- | --- | --- | --- |
| **bonusDamage** (A) | Buck, Bonk, Ice Spear, Poltergeist, Haunt | the swing itself — `AttackSpec.damageMultiplier`, **not** a status | ✅ no status needed |
| **dot** (B) | Poisonous Puke ⭐, Venom Spit, Molten Breath, Munch | `processTurn` tick: subtract `dmgPerTurn` for `turns` | ❌ **new primitive** |
| **stun** (C) | Intimidating Stare, Stomp, Freeze Frame, Iron Curse | input handler / turn gate: player action consumed/skipped | ⚠️ exists as `sleepTurns` |
| **missChance** (D) | Spit (25% miss), Smoke Show | player attack: roll to miss before `computeStrike` | ❌ new (player attacks never miss today) |
| **fear** (E) | Giantfolk Growl, Ingest Spirit Dust | movement: randomize player intent | ⚠️ exists as `confusedTurns` |
| **weaponDebuff** (F) | Oxidize, Disarm, Bone Break, Putrid Bite | `computeStrike` — extend `disarmed`/dmg-reduction | ⚠️ partial (`disarmed`) |
| **armorDebuff** (G) | Shrink, Miniaturize | wherever `totalDef` is computed before `computeMonsterDamage` | ❌ new (read site exists) |
| **atkDebuff** (H) | Maggot Infestation | `computeStrike` dmgBase reduction | ⚠️ exists as `strengthDrained` |
| **steal** (I) | Pickpocket, Chase | `fireAbility` (instant) | ✅ wired |
| **leech** (J) | Seduce | `fireAbility` (instant, heals monster) | ✅ wired |
| **silenceMagic** (N) | Putrid Bite | staff/wand use gate | ❌ new |
| **monster self-buff / multi-hit** (K) | Second Head, Furious Fangs, Laser Focus | *monster*-side state, not a player effect | ❌ new (separate track) |
| **summon** (L) | Rainbow Lash | `fireAbility` spawns a monster | ⚠️ schema-only |
| **teleportPlayer** (M) | Reverse Kick, Chase | engine special (move player / change floor) | ❌ new, one-off |

Note the columns aren't all "player status effect": **A** is an attack property, **K** is
monster-side, **L/M** are instantaneous world mutations. The framework is specifically the
spine for the *persistent player effects* (dot/stun/missChance/fear/weaponDebuff/armorDebuff/
atkDebuff/silenceMagic). The rest reuse `fireAbility`'s existing instant-effect path.

---

## The spine: a unified player-effect list

### Decision: one list, not N more timer fields

Today's pattern (a new `xTurns` field per effect) does not scale to ~8 persistent kinds with
magnitudes, sources, and stacking. Adding `poisonTurns`/`poisonDmg`/`blindTurns`/`shrinkDef`/…
to `StatusEffects` would balloon the interface and scatter the tick logic.

Instead, introduce a single ordered list of active effects on the player:

```ts
// types.ts
export type EffectKind =
  | 'dot' | 'stun' | 'missChance' | 'fear'
  | 'weaponDebuff' | 'armorDebuff' | 'atkDebuff' | 'silenceMagic';

export interface ActiveEffect {
  kind: EffectKind;
  turns: number;          // remaining duration; ticked down each player turn
  magnitude: number;      // dmg/turn, def reduction, miss probability×100, etc. (kind-specific)
  source: string;         // monster id that applied it — for logs ("the bat's poison")
  damageType?: 'poison' | 'fire' | 'acid' | 'bacterial'; // dot flavor (log + future weakness)
}
```

`Player` gains `activeEffects: ActiveEffect[]` (default `[]`). This is **run state** (resets on
new run / death), living alongside `disarmedHits` etc.

### Lifecycle

1. **Apply** — `fireAbility` (the existing on-hit dispatch) pushes an `ActiveEffect`. A
   `applyEffect(player, effect)` helper centralizes stacking policy (default: **refresh
   duration, don't stack magnitude** — re-poison resets the clock; tune per kind later).
2. **Tick** — one new block in `engine.processTurn`, next to the existing status decrements:
   for each effect, apply its per-turn consequence (only `dot` deals damage on tick; others are
   passive reads), decrement `turns`, drop at 0, log expiry. Centralized in a
   `tickPlayerEffects()` method so the turn loop stays readable.
3. **Read** — pure helpers the read sites call, e.g. `effectMagnitude(player, 'armorDebuff')`,
   `hasEffect(player, 'stun')`, `missChance(player)`. Combat math (`combat.ts`) stays pure: the
   engine passes the *resolved* numbers in (it already does this for `disarmed`/`strengthActive`).
4. **Expire** — at `turns === 0`, removed from the list with a flavor log.

### Why this coexists with (and eventually absorbs) TrapEffects

`TrapEffects.sleepTurns`/`confusedTurns`/`strengthDrained` are the same concept (stun / fear /
atkDebuff) reached by a different door. We **do not** rip those out in this plan — risk/scope.
The new list is **additive**: read sites check *both* the legacy field and the new list (e.g.
"player skips turn if `sleepTurns > 0` **or** `hasEffect(player, 'stun')`"). A later cleanup can
migrate traps onto `ActiveEffect` and delete the bespoke fields. Documented as a known seam, not
done here, to keep the slice small.

---

## Data flow: from sheet to effect

The ability stays pure data on the archetype, extending the existing `AbilitySpec`:

```ts
// ai/types.ts — add to AbilityId
'poison'        // (and later: 'stun' | 'blind' | 'shrinkArmor' | ...)

// AbilitySpec already has: { id, chance, magnitude?, cooldown, trigger }
// add optional fields the new kinds need:
duration?: number;        // turns the inflicted effect lasts
damageType?: 'poison' | 'fire' | 'acid' | 'bacterial';
```

`fireAbility` gains a case per kind that translates the spec into an `applyEffect(...)` call.
The Brown Bat assignment becomes:

```ts
// archetypes.ts — new archetype or ability on the bat's existing 'bat' archetype
abilities: [{ id: 'poison', chance: 0.03, magnitude: 1, duration: 3,
              damageType: 'poison', cooldown: 0, trigger: 'onHit' }]
```

`chance: 0.03` is the sheet's "3% on hit" verbatim. `magnitude: 1` / `duration: 3` is "+1 poison
damage per turn for 3 turns" verbatim.

---

## Vertical slice: Brown Bat — Poisonous Puke ⭐

The smallest end-to-end path that forces the whole spine into existence:

1. **types.ts** — add `EffectKind`, `ActiveEffect`, `Player.activeEffects`.
2. **ai/types.ts** — add `'poison'` to `AbilityId`; add `duration?` / `damageType?` to `AbilitySpec`.
3. **effects.ts (new)** — `applyEffect`, `tickPlayerEffects` (returns log lines + total damage),
   `hasEffect`, `effectMagnitude`. Pure where possible; the tick mutates player HP via the engine.
4. **monster.ts** — `fireAbility` case `'poison'` → `applyEffect(player, { kind:'dot', turns:duration, magnitude, source:m, damageType })`.
5. **engine.ts** — call `tickPlayerEffects()` in `processTurn` (logs "The bat's poison courses
   through you (−1)"), and on death-by-poison route through the normal death path.
6. **archetypes.ts** — add the poison ability to the bat.
7. **Tests** — `effects.test.ts` (apply/tick/expire/stack-refresh); extend `src/ai/` bat coverage
   so a forced `chance:1` poison applies and ticks deterministically (mirrors the existing
   leprechaun/nymph/zombie ability tests).
8. **UI (minimal)** — a poison indicator + damage flash is *nice-to-have*; the log line is the
   MVP. Defer the status-icon UI to a follow-up unless trivial.

Acceptance: a bat hit can inflict poison; the player loses `magnitude` HP/turn for `duration`
turns; re-hit refreshes; expiry logs; seeded runs without a poison proc are byte-identical
(the ability only draws RNG when `chance` rolls — guard the `rng.chance` like the other abilities
to preserve parity).

---

## The skill (after the slice lands)

Once Bat-poison works, capture the repeatable pattern as a skill (`adding-monster-abilities`) so
future agents add an ability without re-deriving the architecture. The skill encodes the
checklist: *pick the effect kind → (new kind? add EffectKind + read site + tick consequence) →
add `AbilityId` + `fireAbility` case → assign on the archetype with sheet `chance`/`magnitude`/
`duration` → write the forced-proc test → confirm seeded parity*. New *kinds* are the only part
that touches engine code; new *abilities of an existing kind* (Snake, King Cobra poison) are pure
data — the skill should make that distinction the first decision.

---

## Phasing

1. **Spine + Bat poison (`dot`)** — this doc's slice. Establishes `ActiveEffect`, the tick, one read
   primitive, the test pattern.
2. **Write the skill** from the slice.
3. **Cheap data reuse**: Snake, King Cobra, Munch, Molten Breath → all `dot` data, no new code.
4. **Next kinds, one at a time**, each extending the spine once then becoming data: `stun` (wire to
   the `sleepTurns` precedent), `fear` (`confusedTurns`), `armorDebuff`, `atkDebuff`/`weaponDebuff`
   (extend `computeStrike`), `missChance`, `silenceMagic`.
5. **Monster-side track (K)** and **one-offs (L summon, M teleport)** handled separately — they
   don't use the player-effect spine.
6. **Then** drops, then weaknesses (their own plans, same data-driven philosophy).

---

## Open decisions (need a call before/at build time)

1. **Stacking policy** — refresh-duration (recommended default) vs. stack-magnitude vs.
   independent instances per source. Affects `applyEffect`. Recommend refresh for now.
2. **TrapEffects coexistence** — confirm the additive-read approach (don't migrate traps yet).
   Recommended to keep scope tight.
3. **DoT lethality** — can poison kill the player (death-by-DoT)? Canonical Rogue: yes. Recommend
   yes, routed through the normal death path, since `processTurn` already handles starvation HP loss.
4. **UI surfacing** — log-line only for the slice, or also a status indicator now? Recommend
   log-only MVP, indicator as fast-follow.
5. **`new` vs. extend `StatusEffects`** — this plan adds a *separate* `activeEffects` list rather
   than growing `StatusEffects` (which is semantically "buffs"). Confirm that split is acceptable.
