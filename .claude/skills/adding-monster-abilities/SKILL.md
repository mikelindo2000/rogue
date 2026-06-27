---
name: adding-monster-abilities
description: Add a monster on-hit ability from the GM sheet to the rogue game as data. Use when wiring a sheet "Ability 1/2" onto a monster (poison/stun/fear/steal/etc.), adding a new player status-effect kind, or extending the status-effect spine in src/effects.ts.
---

# Adding Monster Abilities

How to add a monster's on-hit ability (from the GM Mobs sheet) to this game **as data**,
reusing the player status-effect spine. Read this whole file before editing.

Authoritative design: `design/planning/monster_abilities_framework_plan.md`.
Hard rule: **no balance changes** — never edit `MONSTER_DATABASE` (hp/atk/minFloor) in
`src/config.ts`. On-hit abilities are balance-harness-neutral by design.

## Step 0 — Classify the ability (the ONE decision that sets your path)

Every sheet ability maps to an **effect category** (see cols L/M of the Mobs sheet, and the
taxonomy in the framework plan). Two questions decide your work:

1. **Is it a persistent player effect** (dot / stun / fear / armorDebuff / atkDebuff /
   weaponDebuff / missChance / silenceMagic), or an **instant** effect (steal / leech /
   summon / teleportPlayer / bonusDamage / monster self-buff)?
   - Instant + already-wired (`stealGold`/`stealItem`/`leechHeal`) → just add a `fireAbility`
     case or reuse an existing one. Done.
   - `bonusDamage` → NOT an ability at all; it's an `AttackSpec` with a higher
     `damageMultiplier`. See `src/ai/archetypes.ts` (e.g. `brute`).

2. **Does the effect KIND already exist** in `EffectKind` (`src/types.ts`)?
   - **Existing kind → PURE DATA.** Add the `AbilityId` + a `fireAbility` case (or reuse one)
     and assign it on the archetype. No new read sites. (e.g. Snake/King Cobra poison once
     `dot` exists.)
   - **New kind → extend the spine ONCE** (steps A–C below), then it becomes data forever.

> First time through, study the **poison/`dot`** implementation end-to-end — it's the
> reference. Mirror it exactly.

## A. New effect kind — extend the spine (only when the kind is new)

1. `src/types.ts` — add the kind to the `EffectKind` union. Add any kind-specific field to
   `ActiveEffect` only if needed (e.g. `dot` reuses `magnitude` as dmg/turn; a debuff reuses
   `magnitude` as the reduction).
2. `src/effects.ts` — the per-turn consequence in `tickPlayerEffects`:
   - **DoT-like** (deals damage on tick): add a branch that subtracts HP (mirror `dot`).
   - **Passive read** (stun/debuff/miss): NO HP/state consequence in the tick — it's honored at
     its read site (step 3). BUT still add a **log-only** branch, gated on `!expired`, so the
     effect is visible each turn it persists. There is no automatic countdown: the tick only
     logs for kinds with an explicit branch. A kind with no branch produces no per-turn line.
   - **Add a kind-specific `expiryLine`.** The generic fallback is `"The <kind> wears off."`
     (reads as literally "The stun wears off") — add a flavored case for your kind.
   - Use `remainingSuffix(effect.turns)` for the "N turns left" countdown in your log line.
3. **Wire the read site** (where a passive effect is honored). Known sites:
   - stun → player turn/input gate (coexists with `TrapEffects.sleepTurns`).
   - fear → randomize player movement intent (coexists with `TrapEffects.confusedTurns`).
   - armorDebuff → reduce `totalDef` before `computeMonsterDamage`.
   - atkDebuff/weaponDebuff → `computeStrike` (extend the existing `disarmed` reduction; keep
     `combat.ts` pure — pass resolved numbers in from the engine).
   - missChance → roll before `computeStrike` (player attacks never miss today).
   - silenceMagic → staff/wand use gate.

   **⚠️ The two traps when wiring a turn-skipping gate (stun-like), learned the hard way:**
   - **Do NOT decrement the effect's duration in the gate.** `tickPlayerEffects` (called every
     `processTurn`) already owns the countdown. The `sleepTurns` precedent IS misleading here:
     `takeSleepTurn` decrements `sleepTurns` itself because it's a `TrapEffects` *counter*, not
     an `ActiveEffect`. A new `ActiveEffect`-backed gate must be **read-only** — check
     `hasEffect`, log, call `this.processTurn()`, return true. Decrementing here double-ticks
     it (once in the gate, once in the tick) and the effect expires a turn early. The spine
     test can't catch this — only an engine test can (see step D.9).
   - **The player-action gate is not one site.** `takeSleepTurn()` is called at ~13 input
     entry points (move, search, equip, use, drop, zap, run, …). Add your gate (e.g.
     `if (this.takeStunTurn()) return;`) at **every** `takeSleepTurn()` call site, or the
     player escapes the effect by, say, opening their inventory. Mirror `takeSleepTurn`'s
     structure for a new `takeXxxTurn()` helper, minus the decrement.

   Do NOT migrate or delete `TrapEffects` fields — read both additively for now (tracked
   cleanup: td-568d3b).

## B. Wire the ability (every ability)

4. `src/ai/types.ts` — add the id to `AbilityId`. Reuse `AbilitySpec`'s existing fields:
   `chance`, `magnitude`, `duration`, `damageType`, `cooldown`, `trigger`. Add a new optional
   field only if no existing one fits.
5. `src/monster.ts` — add a `case` in `fireAbility`. For a persistent effect, call
   `applyEffect(player, { kind, turns: ab.duration ?? 1, magnitude: ab.magnitude ?? 1,
   source: m.name, ... })`. **Log the application** (`logs.push(...)`) so the proc shows.
   Return `true` when it did something (gates `thenBlink`).
   - **RNG PARITY (critical):** the `fireAbility` body must draw NO `rng.*` beyond what an
     existing case does. The per-ability `rng.chance(ab.chance)` gate in
     `applyOnHitAbilities` is the only roll. An extra unconditional draw desyncs every seeded
     run — guard it exactly like `stealItem`/`leechHeal` (which draw nothing).

## C. Assign on the monster (every ability)

6. `src/ai/archetypes.ts` — add the `AbilitySpec` to **`MONSTER_ABILITIES`**, keyed by the
   monster's id (`monsterId(template)` — usually the kebab-cased name, e.g. `'king-cobra'`),
   using the **sheet values verbatim**: `chance` = the sheet's "3% / 1% on hit" (0.03 / 0.01),
   `magnitude` / `duration` from the ability text.
   - **Always assign here, NOT on the archetype.** Most monsters share an archetype
     (`default`/`brute`/`guardian`/`leech`), so an ability on the archetype leaks to every
     sibling, and per-monster magnitudes (Snake +2 vs King Cobra +5) can't live on a shared
     preset. `MONSTER_ABILITIES` is merged additively on top of the archetype's own abilities,
     so a monster keeps any archetype ability too (e.g. Zachary keeps its leech heal AND gains
     Graveyard Grab).
   - The `AbilityId` is the **dispatch** id (e.g. all DoTs use `'poison'`); the *flavor*
     (poison/fire/acid/bacterial) rides on `damageType`. Don't add a new `AbilityId` per flavor.
   - **A monster may already have a `MONSTER_ABILITIES` row** (e.g. Cyclops has Munch). The
     value is an array — **append** your `AbilitySpec` to it, don't replace the row.
   - Set **`label`** to the sheet ability name (e.g. `label: 'Intimidating Stare'`) — the
     bestiary shows it. Use these **canonical `AbilityId`s** so descriptions line up:
     `poison` (all DoTs; flavor via `damageType`), `stun`, `fear`, `armorDebuff`, `atkDebuff`,
     `weaponDebuff`, `missChance`, `silenceMagic`.

## C2. Bestiary (every ability — usually automatic)

The bestiary (`MonsterDetail.svelte`) lists a defeated monster's abilities via
`monsterAbilities` → `describeAbility` (`src/ai/abilityDescriptions.ts`), which is data-driven
from the `AbilitySpec`. So an ability with a known id + a `label` **surfaces with no UI work**.
- For a **brand-new kind**, add a `generatedName` + `effectText` case in
  `abilityDescriptions.ts` so it reads as a sentence (it falls back to a generic line
  otherwise). Add a `describeAbility` test case (`abilityDescriptions.test.ts`).
- Per-ability *discovery* (only show abilities the player has witnessed) is a future
  enhancement — today a defeated monster shows all its abilities.

## D. Tests (every ability) — mirror the existing patterns

7. New kind → add cases to `src/effects.test.ts` (apply / tick / expire / refresh-on-reapply /
   read-site honored / death-by-effect if it can kill). New read site → a test at that site.
8. The ability → mirror `src/ai/bat.test.ts` (and `leprechaun`/`nymph`/`zombie` tests):
   - force the proc with a stubbed RNG (`chance: 1`) and assert the effect applied + ticked;
   - a `chance: 0` case asserting **no proc leaves the player untouched** (parity);
   - if relevant, a harness-reading test asserting balance-neutrality.
   - The RNG stub copied from `bat.test.ts` must annotate `range: (min: number) => min` — an
     un-annotated param trips svelte-check's implicit-any (vitest alone won't catch it, but
     `npm run check` runs svelte-check first).
9. A read site or death path is involved → add an **engine-level** test in `src/engine.test.ts`
   — `effects.test.ts` can't prove the engine honors the effect. For a turn-skipping gate,
   assert a duration-1 effect costs exactly one action then recovers, and a duration-2 costs
   two (this is what catches the double-decrement trap from step 3). For a death path, see the
   poison DoT-death tests.

## E. Verify & commit

10. `npm run check` (svelte-check typecheck + full vitest). Must be clean. Report honestly.
11. Confirm a no-proc seeded run is unaffected (existing seeded tests stay green).
12. Commit. Keep `MONSTER_DATABASE` untouched in the diff.

## Reference: files & sheet

| Concern | Location |
| --- | --- |
| Effect spine | `src/effects.ts` (`applyEffect`, `tickPlayerEffects`, `hasEffect`, `effectMagnitude`) |
| Effect/ability types | `src/types.ts` (`EffectKind`, `ActiveEffect`), `src/ai/types.ts` (`AbilityId`, `AbilitySpec`) |
| Ability dispatch | `src/monster.ts` (`fireAbility`, `applyOnHitAbilities`) |
| Monster→archetype | `src/ai/archetypes.ts` (`ARCHETYPES`, `MONSTER_ARCHETYPE`) |
| Per-monster abilities | `src/ai/archetypes.ts` (`MONSTER_ABILITIES`) — the canonical home for sheet abilities |
| Turn tick / death | `src/engine.ts` (`processTurn` ~L2374, death-cause block) |
| Pure combat math | `src/combat.ts` (`computeStrike`, `computeMonsterDamage`) — keep pure |
| GM sheet | id `1DXfUQDERdWntg4UuborVCLc5iFofAt61lviBCtHqYBc`, tab **Mobs**; read/write with `gog sheets get|update`. Cols L/M hold the effect-category mapping — keep it current. |

## Worked example: Brown Bat — Poisonous Puke (the `dot` reference)

- Sheet: Ability 1, "Poisonous Puke (+1 poison damage per turn for 3 turns)", 3% on hit.
- New kind `dot` → extended `tickPlayerEffects` (damage + countdown), routed lethal DoT
  through the engine death path.
- `AbilityId` `'poison'`; `fireAbility` `case 'poison'` → `applyEffect({ kind:'dot', turns:3,
  magnitude:1, source, damageType:'poison' })` + a "pukes poison on you!" log.
- Assignment: `MONSTER_ABILITIES['brown-bat'] = [{ id:'poison', chance:0.03, magnitude:1,
  duration:3, damageType:'poison', cooldown:0, trigger:'onHit' }]`.
- Tests: `effects.test.ts` (spine) + `bat.test.ts` (proc/no-proc/parity) + `engine.test.ts`
  (DoT death) + `dot-abilities.test.ts` (per-monster resolution + no sibling leak). No
  `MONSTER_DATABASE` change.

> The same `'poison'` dispatch + `MONSTER_ABILITIES` row, with different
> `magnitude`/`duration`/`damageType`, is all Snake / King Cobra / Cyclops-Munch /
> Dragon / Zachary / Dragon-King needed — **pure data, no engine code**. That's the payoff
> of extending the spine once.
