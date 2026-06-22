import { Monster, Player, StatusEffects } from './types';
import { getScaledMonsterAtk } from './config';
import { RNG } from './rng';
import { computeMonsterDamage } from './combat';
import { decideMonsterAction, ensureRuntime } from './ai/brain';
import { resolveBehavior } from './ai/archetypes';
import type { AIAction, AbilitySpec, AttackSpec, MonsterBehavior } from './ai/types';

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
  turn = 0
) {
  for (const m of monsters) {
    if (m.frozenTurns > 0) {
      m.frozenTurns--;
      continue;
    }

    const behavior = resolveBehavior(m);
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
    });

    applyAction(action, m, behavior, player, totalDef, addLog, rng, turn);
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
  turn: number
) {
  switch (action.type) {
    case 'wait':
      return;
    case 'move':
      m.x += action.dx;
      m.y += action.dy;
      return;
    case 'attack':
      applyAttack(m, behavior, action.attackId, player, totalDef, addLog, rng, turn);
      return;
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
  turn: number
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
  addLog(isSwipe ? `${m.name} uses Swipe! hits for ${dmg} dmg.` : `${m.name} hits for ${dmg} dmg.`);

  if (attack.cooldown > 0) rt.cooldowns[attack.id] = turn + 1 + attack.cooldown;

  // On-hit abilities (steal, leech, …) fire as side effects of landing a blow.
  applyOnHitAbilities(behavior, m, player, rng).forEach(addLog);
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
  rng: RNG
): string[] {
  const rt = ensureRuntime(m);
  const logs: string[] = [];
  for (const ab of behavior.abilities) {
    if (ab.trigger !== 'onHit' || !rng.chance(ab.chance)) continue;
    fireAbility(ab, m, player, logs);
    if (ab.thenFlee) rt.state = 'fleeing';
  }
  return logs;
}

function fireAbility(ab: AbilitySpec, m: Monster, player: Player, logs: string[]) {
  switch (ab.id) {
    case 'stealGold': {
      const amount = Math.min(player.gold, ab.magnitude ?? 0);
      if (amount > 0) {
        player.gold -= amount;
        logs.push(`${m.name} steals ${amount} gold!`);
      }
      break;
    }
    case 'leechHeal': {
      const maxHp = m.maxHp ?? m.hp;
      const heal = Math.min(maxHp - m.hp, ab.magnitude ?? 0);
      if (heal > 0) {
        m.hp += heal;
        logs.push(`${m.name} drains your vitality!`);
      }
      break;
    }
    // stealItem / freeze / drainStrength / summon are schema-only for now —
    // safely ignored until the engine grows hooks for them.
    default:
      break;
  }
}
