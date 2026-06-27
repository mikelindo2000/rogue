import { describe, it, expect } from 'vitest';
import type { RNG } from '../rng';
import type { Monster, Player } from '../types';
import { resolveBehavior, archetypeOf } from './archetypes';
import { applyOnHitAbilities } from '../monster';
import { hasEffect, effectMagnitude, tickPlayerEffects } from '../effects';

/**
 * The atkDebuff ability: a NEW effect kind whose read site reduces the player's
 * base attack (Zachary "Maggot Infestation", Golem "Oxidize"). Assigned
 * per-monster in MONSTER_ABILITIES so siblings sharing an archetype are
 * unaffected. Values verbatim from the sheet (3% on hit).
 *
 * Mirrors stun-abilities.test.ts. The engine-level proof that the computeStrike
 * caller honors it (lower player damage) lives in engine.test.ts.
 */

function monster(name: string, over: Partial<Monster> = {}): Monster {
  return {
    x: 0,
    y: 0,
    symbol: 'Z',
    name,
    hp: 100,
    maxHp: 100,
    atk: 90,
    color: '#fff',
    minFloor: 19,
    frozenTurns: 0,
    ...over,
  };
}

function player(over: Partial<Player> = {}): Player {
  return { hp: 20, maxHp: 20, gold: 0, activeEffects: [], ...over } as unknown as Player;
}

function chanceRng(fire: boolean): RNG {
  return {
    seed: 0,
    next: () => 0,
    int: () => 0,
    range: (min: number) => min,
    chance: () => fire,
    pick: <T>(a: readonly T[]) => a[0],
    getState: () => 0,
  } as unknown as RNG;
}

describe('atkDebuff abilities (Zachary the Zombie / Golem)', () => {
  it('Zachary resolves with a Maggot Infestation atk debuff (3% / -10 / 3t) on top of its DoT + leech', () => {
    const b = resolveBehavior({ name: 'Zachary the Zombie' });
    expect(archetypeOf({ name: 'Zachary the Zombie' })).toBe('leech');
    const deb = b.abilities.find((a) => a.id === 'atkDebuff');
    expect(deb).toBeDefined();
    expect(deb!.label).toBe('Maggot Infestation');
    expect(deb!.chance).toBe(0.03);
    expect(deb!.magnitude).toBe(10);
    expect(deb!.duration).toBe(3);
    // It keeps its Graveyard Grab DoT and the leech-archetype heal too.
    expect(b.abilities.find((a) => a.id === 'poison')).toBeDefined();
    expect(b.abilities.find((a) => a.id === 'leechHeal')).toBeDefined();
  });

  it('Golem resolves with an Oxidize atk debuff (3% / -3 / 3t)', () => {
    const b = resolveBehavior({ name: 'Golem' });
    expect(archetypeOf({ name: 'Golem' })).toBe('guardian');
    const deb = b.abilities.find((a) => a.id === 'atkDebuff');
    expect(deb).toBeDefined();
    expect(deb!.label).toBe('Oxidize');
    expect(deb!.magnitude).toBe(3);
    expect(deb!.duration).toBe(3);
  });

  it('inflicts an atk debuff on a passing hit, exposes its magnitude, then ticks away', () => {
    const b = resolveBehavior({ name: 'Golem' });
    const m = monster('Golem');
    const p = player({ hp: 20 });

    const logs = applyOnHitAbilities(b, m, p, chanceRng(true));
    expect(hasEffect(p, 'atkDebuff')).toBe(true);
    expect(effectMagnitude(p, 'atkDebuff')).toBe(3);
    expect(logs.join(' ')).toMatch(/Golem saps your strength/);
    expect(p.hp).toBe(20);

    tickPlayerEffects(p);
    tickPlayerEffects(p);
    tickPlayerEffects(p);
    expect(hasEffect(p, 'atkDebuff')).toBe(false);
  });

  it('does not debuff (or touch the player) on a failed roll (parity)', () => {
    const b = resolveBehavior({ name: 'Golem' });
    const m = monster('Golem');
    const p = player({ hp: 20 });

    const logs = applyOnHitAbilities(b, m, p, chanceRng(false));
    expect(hasEffect(p, 'atkDebuff')).toBe(false);
    expect(p.activeEffects).toHaveLength(0);
    expect(logs).toHaveLength(0);
  });

  it('does not leak the debuff to siblings sharing the guardian archetype', () => {
    // Gary the Golem & Dragon share 'guardian' with Golem but have their own sheet
    // abilities — they must NOT inherit Oxidize.
    expect(resolveBehavior({ name: 'Gary the Golem' }).abilities.find((a) => a.id === 'atkDebuff')).toBeUndefined();
    expect(resolveBehavior({ name: 'Dragon' }).abilities.find((a) => a.id === 'atkDebuff')).toBeUndefined();
  });
});
