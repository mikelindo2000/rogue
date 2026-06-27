import { describe, it, expect } from 'vitest';
import type { RNG } from '../rng';
import type { Monster, Player } from '../types';
import { resolveBehavior, archetypeOf } from './archetypes';
import { applyOnHitAbilities } from '../monster';
import { hasEffect, tickPlayerEffects } from '../effects';

/**
 * The weaponDebuff ability: a NEW effect kind whose read site marks the player's
 * strike `disarmed` (reusing computeStrike's existing disarm halving) — Troll
 * "Disarm", Trogdor "Bone Break". Assigned per-monster in MONSTER_ABILITIES so
 * siblings sharing an archetype are unaffected. Values verbatim (1% on hit).
 *
 * Mirrors stun-abilities.test.ts. The engine-level proof that the strike is
 * halved lives in engine.test.ts.
 */

function monster(name: string, over: Partial<Monster> = {}): Monster {
  return {
    x: 0,
    y: 0,
    symbol: 'T',
    name,
    hp: 100,
    maxHp: 100,
    atk: 64,
    color: '#fff',
    minFloor: 14,
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

describe('weaponDebuff abilities (Troll / Trogdor the Troll)', () => {
  it('Troll resolves with a Disarm weapon debuff (1% / 2 turns)', () => {
    const b = resolveBehavior({ name: 'Troll' });
    expect(archetypeOf({ name: 'Troll' })).toBe('default');
    const deb = b.abilities.find((a) => a.id === 'weaponDebuff');
    expect(deb).toBeDefined();
    expect(deb!.label).toBe('Disarm');
    expect(deb!.chance).toBe(0.01);
    expect(deb!.duration).toBe(2);
  });

  it('Trogdor resolves with a Bone Break weapon debuff (1% / 2 turns)', () => {
    const b = resolveBehavior({ name: 'Trogdor the Troll' });
    const deb = b.abilities.find((a) => a.id === 'weaponDebuff');
    expect(deb).toBeDefined();
    expect(deb!.label).toBe('Bone Break');
    expect(deb!.duration).toBe(2);
  });

  it('inflicts a weapon debuff on a passing hit, then ticks away', () => {
    const b = resolveBehavior({ name: 'Troll' });
    const m = monster('Troll');
    const p = player({ hp: 20 });

    const logs = applyOnHitAbilities(b, m, p, chanceRng(true));
    expect(hasEffect(p, 'weaponDebuff')).toBe(true);
    expect(p.activeEffects[0]).toMatchObject({ kind: 'weaponDebuff', turns: 2, source: 'Troll' });
    expect(logs.join(' ')).toMatch(/Troll disarms you/);
    expect(p.hp).toBe(20);

    tickPlayerEffects(p);
    tickPlayerEffects(p);
    expect(hasEffect(p, 'weaponDebuff')).toBe(false);
  });

  it('does not debuff (or touch the player) on a failed roll (parity)', () => {
    const b = resolveBehavior({ name: 'Troll' });
    const m = monster('Troll');
    const p = player({ hp: 20 });

    const logs = applyOnHitAbilities(b, m, p, chanceRng(false));
    expect(hasEffect(p, 'weaponDebuff')).toBe(false);
    expect(p.activeEffects).toHaveLength(0);
    expect(logs).toHaveLength(0);
  });

  it('does not leak the debuff to siblings sharing the default archetype', () => {
    expect(resolveBehavior({ name: 'Orc' }).abilities.find((a) => a.id === 'weaponDebuff')).toBeUndefined();
    // A monster with no assignment at all resolves to a clean, empty ability list.
    expect(resolveBehavior({ name: 'Practice Dummy' }).abilities).toHaveLength(0);
  });
});
