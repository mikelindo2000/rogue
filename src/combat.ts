import { GearItem } from './types';
import { BALANCE } from './config';
import { RNG } from './rng';

/**
 * Pure combat math. These functions take state in and return values out — no
 * mutation, no logging, no DOM. The engine applies the results (subtract HP,
 * push log lines, decrement counters). Keeping the math pure makes it directly
 * unit-testable and keeps the damage rules in one place.
 */

export interface StrikeOutcome {
  /** Damage to apply to the target. */
  damage: number;
  /** HP the attacker heals from this strike (arcane staff). */
  selfHeal: number;
  /** Turns to freeze the target for (frost staff); 0 if none. */
  freezeTurns: number;
  /** Flavor lines the engine should log (e.g. "Flames erupt!"). */
  messages: string[];
}

/** Resolve one player weapon strike against a monster. */
export function computeStrike(params: {
  baseAtk: number;
  weapon: GearItem;
  strengthActive: boolean;
  disarmed: boolean;
  rng: RNG;
}): StrikeOutcome {
  const { baseAtk, weapon, strengthActive, disarmed, rng } = params;
  const C = BALANCE.combat;
  const messages: string[] = [];

  let dmgBase = baseAtk + (weapon.dmg ?? 0);
  if (strengthActive) dmgBase += C.strengthBonus;
  if (disarmed) dmgBase = Math.floor(dmgBase / C.disarmDivisor);

  let selfHeal = 0;
  let freezeTurns = 0;

  if (weapon.type === 'staff') {
    if (weapon.magic === 'fire') {
      dmgBase += C.staffFireBonus;
      messages.push('Flames erupt!');
    } else if (weapon.magic === 'arcane') {
      selfHeal = C.staffArcaneHeal;
      messages.push('Siphoned health!');
    } else if (weapon.magic === 'frost' && rng.chance(C.frostFreezeChance)) {
      freezeTurns = C.frostFreezeTurns;
    }
  }

  const damage = Math.max(1, rng.int(Math.max(1, dmgBase)) + C.playerHitBonus);
  return { damage, selfHeal, freezeTurns, messages };
}

/** Resolve a monster's melee hit against the player. */
export function computeMonsterDamage(params: {
  scaledAtk: number;
  totalDef: number;
  swipe: boolean;
  rng: RNG;
}): number {
  const C = BALANCE.combat;
  const raw = params.rng.int(Math.max(1, params.scaledAtk)) + C.monsterHitBonus;
  let dmg = Math.max(1, Math.floor((raw - Math.floor(params.totalDef / C.defenseDivisor)) * C.monsterDamageScale));
  if (params.swipe) dmg *= 2;
  return dmg;
}
