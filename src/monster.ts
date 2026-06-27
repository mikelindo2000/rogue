import { Monster, Player, StatusEffects } from './types';
import { getScaledMonsterAtk } from './config';
import { RNG } from './rng';
import { computeMonsterDamage } from './combat';
import { applyEffect } from './effects';
import { describeAbility } from './ai/abilityDescriptions';
import { decideMonsterAction, ensureRuntime } from './ai/brain';
import { resolveBehavior, defaultBehavior } from './ai/archetypes';
import type { AIAction, AbilitySpec, AttackSpec, MonsterBehavior, MonsterAIRuntime } from './ai/types';

/** Visual hooks the AI fires for telegraphed attacks. Defaulted to no-ops so
 *  headless callers (tests, the balance sim) need not supply them. */
export interface AIFx {
  dive(fromX: number, fromY: number, toX: number, toY: number, color: string): void;
  whiff(x: number, y: number): void;
  /** A floating label over a tile (ability proc name), like the bat's "dodge". */
  float(x: number, y: number, text: string, color: string): void;
}

const NO_FX: AIFx = { dive() {}, whiff() {}, float() {} };

/** Build the on-proc visual: a floating ability-name label over the player (the
 *  one afflicted), mirroring the bat-dodge float. */
function procFloat(fx: AIFx, m: Monster, player: Player): (ab: AbilitySpec) => void {
  return (ab) => fx.float(player.x, player.y, describeAbility(ab).name, m.color);
}

/**
 * Advance every monster one turn.
 *
 * This is now a thin shell: the behavior interpreter (src/ai/brain.ts) decides
 * each monster's action from its resolved behavior profile, and this function
 * applies the resulting intent (move / attack / wait) to the world. Monsters on
 * the `default` archetype decide exactly what the old hand-rolled logic did, so
 * existing encounters and seeded runs are unchanged.
 */
export function processMonsterAI(
  monsters: Monster[],
  player: Player,
  statusEffects: StatusEffects,
  map: string[][],
  cols: number,
  rows: number,
  totalDef: number,
  addLog: (msg: string) => void,
  rng: RNG,
  turn = 0,
  fx: AIFx = NO_FX,
  dark?: boolean[][],
  floor = 1,
  onBlink?: (m: Monster) => void,
  onPlayerDamaged?: (m: Monster, damage: number) => void
) {
  for (const m of monsters) {
    if (m.frozenTurns > 0) {
      m.frozenTurns--;
      continue;
    }

    const rt = ensureRuntime(m);
    // Wand of Cancellation: while active, the monster is stripped to plain melee
    // (no telegraphed specials/abilities) and any charged attack is dropped.
    const cancelled = (m.canceledTurns ?? 0) > 0;
    if (cancelled) {
      m.canceledTurns!--;
      rt.pendingAttack = undefined;
    }
    const behavior = cancelled ? defaultBehavior() : resolveBehavior(m);

    // A committed telegraphed attack overrides everything: the monster either
    // resolves it (if due) or keeps charging. Either way it takes no other
    // action this turn.
    if (rt.pendingAttack) {
      if (turn >= rt.pendingAttack.resolveTurn) {
        resolvePendingAttack(m, rt, behavior, player, totalDef, addLog, rng, turn, fx, floor, onPlayerDamaged);
        if (rt.pendingBlink) {
          rt.pendingBlink = false;
          onBlink?.(m);
        }
      }
      continue;
    }

    const action = decideMonsterAction({
      monster: m,
      behavior,
      player,
      status: statusEffects,
      map,
      cols,
      rows,
      monsters,
      rng,
      turn,
      dark,
    });

    applyAction(action, m, behavior, player, totalDef, addLog, rng, turn, floor, onPlayerDamaged, fx);
    // An on-hit ability (leprechaun steal) may have requested a blink-away: the
    // monster hits, then vanishes to a random floor tile this same turn.
    if (rt.pendingBlink) {
      rt.pendingBlink = false;
      onBlink?.(m);
    }
  }
}

/** Resolve a telegraphed attack whose windup has elapsed: it lands only if the
 *  player is still on the committed target tile (else it whiffs — the player
 *  dodged by stepping away). */
function resolvePendingAttack(
  m: Monster,
  rt: MonsterAIRuntime,
  behavior: MonsterBehavior,
  player: Player,
  totalDef: number,
  addLog: (msg: string) => void,
  rng: RNG,
  turn: number,
  fx: AIFx,
  floor: number,
  onPlayerDamaged?: (m: Monster, damage: number) => void
) {
  const pend = rt.pendingAttack!;
  rt.pendingAttack = undefined;
  const attack: AttackSpec = behavior.attacks.find((a) => a.id === pend.attackId) ?? behavior.attacks[0];
  rt.cooldowns[attack.id] = turn + 1 + attack.cooldown;

  fx.dive(m.x, m.y, pend.targetX, pend.targetY, m.color);

  const landed = player.x === pend.targetX && player.y === pend.targetY;
  if (landed) {
    const scaledAtk = getScaledMonsterAtk(Math.max(1, Math.round(m.atk * attack.damageMultiplier)));
    const dmg = computeMonsterDamage({ scaledAtk, totalDef, swipe: false, rng });
    player.hp -= dmg;
    onPlayerDamaged?.(m, dmg);
    addLog(`${m.name}'s swoop hits for ${dmg}!`);
    applyOnHitAbilities(behavior, m, player, rng, floor, procFloat(fx, m, player)).forEach(addLog);
  } else {
    fx.whiff(pend.targetX, pend.targetY);
    addLog(`You dodge ${m.name}'s swoop!`);
  }
}

/** Resolve one intent against the world. The brain has already validated moves
 *  for walkability/occupancy, so application is a straight mutation. */
function applyAction(
  action: AIAction,
  m: Monster,
  behavior: MonsterBehavior,
  player: Player,
  totalDef: number,
  addLog: (msg: string) => void,
  rng: RNG,
  turn: number,
  floor: number,
  onPlayerDamaged?: (m: Monster, damage: number) => void,
  fx: AIFx = NO_FX
) {
  switch (action.type) {
    case 'wait':
      return;
    case 'move':
      m.x += action.dx;
      m.y += action.dy;
      return;
    case 'attack':
      applyAttack(m, behavior, action.attackId, player, totalDef, addLog, rng, turn, floor, onPlayerDamaged, fx);
      return;
    case 'windup': {
      // Commit to a telegraphed strike: record the target tile + resolve turn.
      // The renderer draws the telegraph from this pending state.
      const attack = behavior.attacks.find((a) => a.id === action.attackId) ?? behavior.attacks[0];
      const rt = ensureRuntime(m);
      rt.pendingAttack = {
        attackId: action.attackId,
        resolveTurn: turn + Math.max(1, attack.windupTurns),
        targetX: action.targetX,
        targetY: action.targetY,
      };
      addLog(`${m.name} dives at you!`);
      return;
    }
  }
}

function applyAttack(
  m: Monster,
  behavior: MonsterBehavior,
  attackId: string,
  player: Player,
  totalDef: number,
  addLog: (msg: string) => void,
  rng: RNG,
  turn: number,
  floor: number,
  onPlayerDamaged?: (m: Monster, damage: number) => void,
  fx: AIFx = NO_FX
) {
  const rt = ensureRuntime(m);
  const attack: AttackSpec = behavior.attacks.find((a) => a.id === attackId) ?? behavior.attacks[0];

  // Marcus the Brave's signature: every other swing is a double-damage swipe.
  let isSwipe = false;
  if (attack.swipeAlternates) {
    if (rt.swipeToggle) isSwipe = true;
    rt.swipeToggle = !rt.swipeToggle;
  }

  const scaledAtk = getScaledMonsterAtk(Math.max(1, Math.round(m.atk * attack.damageMultiplier)));
  const dmg = computeMonsterDamage({ scaledAtk, totalDef, swipe: isSwipe, rng });
  player.hp -= dmg;
  onPlayerDamaged?.(m, dmg);
  addLog(isSwipe ? `${m.name} uses Swipe! hits for ${dmg} dmg.` : `${m.name} hits for ${dmg} dmg.`);

  if (attack.cooldown > 0) rt.cooldowns[attack.id] = turn + 1 + attack.cooldown;

  // On-hit abilities (steal, leech, …) fire as side effects of landing a blow.
  applyOnHitAbilities(behavior, m, player, rng, floor, procFloat(fx, m, player)).forEach(addLog);
}

/**
 * Fire every `onHit` ability whose chance roll passes, mutating the monster and
 * player, and return the log lines produced. Exported so the ability effects
 * can be unit-tested directly with deterministic (chance = 1) profiles.
 */
export function applyOnHitAbilities(
  behavior: MonsterBehavior,
  m: Monster,
  player: Player,
  rng: RNG,
  floor = 1,
  onProc?: (ab: AbilitySpec) => void
): string[] {
  const rt = ensureRuntime(m);
  const logs: string[] = [];
  for (const ab of behavior.abilities) {
    if (ab.trigger !== 'onHit' || !rng.chance(ab.chance)) continue;
    const applied = fireAbility(ab, m, player, logs, rng, floor);
    // Flat extra damage rides on top of any status effect (and is the whole
    // payload of a pure 'bonusDamage' ability). The engine's post-attack hp<=0
    // check ends the run if this is lethal, like the base melee hit.
    if (ab.bonusDamage && ab.bonusDamage > 0) {
      player.hp -= ab.bonusDamage;
      logs.push(`${m.name}'s ${ab.label ?? 'blow'} strikes for ${ab.bonusDamage}!`);
    }
    // Surface the proc as a floating ability-name label on the map.
    onProc?.(ab);
    if (ab.thenFlee) rt.state = 'fleeing';
    // Blink only when the ability actually did something — a leprechaun that hit
    // a broke player has nothing to vanish with, so it stays and keeps swinging.
    if (ab.thenBlink && applied) rt.pendingBlink = true;
  }
  return logs;
}

/**
 * Apply one ability's effect. Returns whether it did something meaningful (used
 * to gate `thenBlink`). `rng`/`floor` let depth-scaled effects (the leprechaun's
 * GOLDCALC steal) draw randomness — only the stealGold path consumes them, so
 * other abilities keep their existing RNG footprint and seeded parity.
 */
function fireAbility(ab: AbilitySpec, m: Monster, player: Player, logs: string[], rng: RNG, floor: number): boolean {
  switch (ab.id) {
    case 'stealGold': {
      // Canonical Rogue GOLDCALC = rnd(50 + 10·depth) + 2. A failed save vs. magic
      // lets the leprechaun grab the big 5× purse; a save limits it to 1×. Save
      // odds rise with player level: (4 + level/2) × 5%.
      const saveChance = Math.min(0.99, 0.05 * (4 + Math.floor(player.level / 2)));
      const saved = rng.chance(saveChance);
      const goldcalc = 2 + rng.int(50 + 10 * floor);
      const want = saved ? goldcalc : goldcalc * 5;
      const amount = Math.min(player.gold, want);
      if (amount > 0) {
        player.gold -= amount;
        // The gold isn't destroyed — it rides in the thief's purse and drops on
        // death, so a slain leprechaun refunds what it took (see handleMonsterDeath).
        m.gold = (m.gold ?? 0) + amount;
        logs.push(`${m.name} steals ${amount} gold!`);
        return true;
      }
      return false;
    }
    case 'leechHeal': {
      const maxHp = m.maxHp ?? m.hp;
      const heal = Math.min(maxHp - m.hp, ab.magnitude ?? 0);
      if (heal > 0) {
        m.hp += heal;
        logs.push(`${m.name} drains your vitality!`);
        return true;
      }
      return false;
    }
    case 'poison': {
      // Inflict a damage-over-time effect on the player. Like stealItem/leechHeal
      // this case body draws nothing from `rng` — it adds no EXTRA draw beyond the
      // standard per-ability chance gate in applyOnHitAbilities. (That gate is the
      // one draw a no-proc hit still costs; it is not "free" parity with a monster
      // that had no abilities at all — see the bat archetype note.)
      // Re-applying refreshes the duration (see applyEffect's stacking policy).
      applyEffect(player, {
        kind: 'dot',
        turns: ab.duration ?? 1,
        magnitude: ab.magnitude ?? 1,
        source: m.name,
        damageType: ab.damageType ?? 'poison',
      });
      logs.push(`${m.name} pukes ${ab.damageType ?? 'poison'} on you!`);
      return true;
    }
    case 'stun': {
      // Inflict a stun: the player loses their next action(s) (honored at the
      // player turn gate in engine.ts — takeStunTurn). Like the poison case this
      // body draws nothing from `rng`; the only roll is the per-ability chance
      // gate in applyOnHitAbilities, so seeded parity is preserved.
      // Re-applying refreshes the duration (applyEffect's stacking policy).
      applyEffect(player, {
        kind: 'stun',
        turns: ab.duration ?? 1,
        magnitude: ab.magnitude ?? 1,
        source: m.name,
      });
      logs.push(`${m.name} makes you cower in fear!`);
      return true;
    }
    case 'fear': {
      // Inflict fear: while it lasts the player's MOVE input is redirected to a
      // random direction (honored at the engine MOVE handler). Like the poison/stun
      // cases this body draws nothing from `rng` — the only roll is the per-ability
      // chance gate in applyOnHitAbilities, so seeded parity is preserved.
      // Re-applying refreshes the duration (applyEffect's stacking policy).
      applyEffect(player, {
        kind: 'fear',
        turns: ab.duration ?? 1,
        magnitude: ab.magnitude ?? 1,
        source: m.name,
      });
      logs.push(`${m.name} fills you with terror!`);
      return true;
    }
    case 'armorDebuff': {
      // Inflict an armor debuff: its magnitude is subtracted from the player's
      // total defense (honored at getTotalDef in player.ts), clamped to >= 0.
      // Like the other persistent-effect cases this body draws nothing from `rng`
      // — the only roll is the per-ability chance gate in applyOnHitAbilities, so
      // seeded parity is preserved. Re-applying refreshes the duration.
      applyEffect(player, {
        kind: 'armorDebuff',
        turns: ab.duration ?? 1,
        magnitude: ab.magnitude ?? 1,
        source: m.name,
      });
      logs.push(`${m.name} weakens your armor!`);
      return true;
    }
    case 'atkDebuff': {
      // Inflict an attack debuff: its magnitude is subtracted from the player's
      // base attack at the computeStrike caller (engine.ts). Like the other
      // persistent-effect cases this body draws nothing from `rng` — the only roll
      // is the per-ability chance gate in applyOnHitAbilities, so seeded parity is
      // preserved. Re-applying refreshes the duration.
      applyEffect(player, {
        kind: 'atkDebuff',
        turns: ab.duration ?? 1,
        magnitude: ab.magnitude ?? 1,
        source: m.name,
      });
      logs.push(`${m.name} saps your strength!`);
      return true;
    }
    case 'weaponDebuff': {
      // Inflict a weapon debuff: while active the player's strike is treated as
      // `disarmed` at the computeStrike caller (reusing the existing disarm
      // halving). Like the other persistent-effect cases this body draws nothing
      // from `rng` — the only roll is the per-ability chance gate in
      // applyOnHitAbilities, so seeded parity is preserved. magnitude is unused
      // (the halving is fixed); duration carries the effect. Re-applying refreshes.
      applyEffect(player, {
        kind: 'weaponDebuff',
        turns: ab.duration ?? 1,
        magnitude: ab.magnitude ?? 1,
        source: m.name,
      });
      logs.push(`${m.name} disarms you!`);
      return true;
    }
    case 'missChance': {
      // Inflict a miss chance: while active each player attack rolls `magnitude`
      // as a miss probability (honored at the player-attack method in engine.ts).
      // Like the other persistent-effect cases this body draws nothing from `rng`
      // — the only roll is the per-ability chance gate in applyOnHitAbilities, so
      // seeded parity is preserved. magnitude is the miss probability (0..1).
      // Re-applying refreshes the duration.
      applyEffect(player, {
        kind: 'missChance',
        turns: ab.duration ?? 1,
        magnitude: ab.magnitude ?? 0,
        source: m.name,
      });
      logs.push(`${m.name} blinds you!`);
      return true;
    }
    case 'silenceMagic': {
      // Inflict magic silence: while active the player cannot zap wands (gated at
      // zapWand in engine.ts). Like the other persistent-effect cases this body
      // draws nothing from `rng` — the only roll is the per-ability chance gate in
      // applyOnHitAbilities, so seeded parity is preserved. magnitude is unused;
      // duration carries the effect. Re-applying refreshes the duration.
      applyEffect(player, {
        kind: 'silenceMagic',
        turns: ab.duration ?? 1,
        magnitude: ab.magnitude ?? 1,
        source: m.name,
      });
      logs.push(`${m.name} seals your magic!`);
      return true;
    }
    case 'stealItem': {
      // The canonical Rogue nymph: snatch an item and vanish. We steal a random
      // POTION, which is the only inventory bucket safe to mutate blindly —
      // `inventory.potions` is a plain PotionType[] with no equip indices, unlike
      // weapons/armor where `player.equipped` holds INDICES into the arrays
      // (removing an element would shift those indices and corrupt equipped gear).
      // If the player carries no potions, fall back to stealing gold so the nymph
      // always does something thematic (and the steal magnitude reads as gold).
      const potions = player.inventory?.potions;
      if (potions && potions.length > 0) {
        // Take the first potion. Deterministic on purpose: although `rng` is now in
        // scope, the nymph path draws nothing from it — adding a per-hit random draw
        // to this shared path would desync seeded runs (see the RNG-parity gotcha).
        const stolen = potions.shift()!;
        (m.stolenLoot ??= []).push({
          type: 'potion',
          symbol: '!',
          color: '#ff66ff',
          data: { potionType: stolen },
        });
        logs.push(`${m.name} snatches your ${stolen} potion and vanishes!`);
        return true;
      }
      const amount = Math.min(player.gold, ab.magnitude ?? 0);
      if (amount > 0) {
        player.gold -= amount;
        (m.stolenLoot ??= []).push({ type: 'gold', amount, symbol: '$', color: '#ffff55' });
        logs.push(`${m.name} snatches ${amount} gold and vanishes!`);
        return true;
      }
      return false;
    }
    // A pure 'bonusDamage' ability has no status payload — the flat damage is
    // applied by applyOnHitAbilities from `ab.bonusDamage`. Nothing to do here.
    case 'bonusDamage':
      return false;
    // freeze / drainStrength / summon are schema-only for now — safely ignored
    // until the engine grows hooks for them.
    default:
      return false;
  }
}
