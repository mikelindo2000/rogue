import { describe, it, expect } from 'vitest';
import type { RNG } from '../rng';
import type { Monster, Player } from '../types';
import { resolveBehavior, archetypeOf } from './archetypes';
import { applyOnHitAbilities } from '../monster';
import { hasEffect, effectMagnitude, tickPlayerEffects } from '../effects';

/**
 * The missChance ability: a NEW effect kind whose read site may whiff the
 * player's attack (Quinotaur "Spit", Dragon "Smoke Show"). Assigned per-monster
 * in MONSTER_ABILITIES so siblings sharing an archetype are unaffected. Values
 * verbatim from the sheet (1% on hit; magnitude is the miss probability).
 *
 * Mirrors stun-abilities.test.ts. The engine-level proof that a player attack can
 * miss while afflicted lives in engine.test.ts.
 */

function monster(name: string, over: Partial<Monster> = {}): Monster {
  return {
    x: 0,
    y: 0,
    symbol: 'Q',
    name,
    hp: 100,
    maxHp: 100,
    atk: 86,
    color: '#fff',
    minFloor: 18,
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

describe('missChance abilities (Quinotaur / Dragon)', () => {
  it('Quinotaur resolves with a Spit miss chance (1% / 0.25 / 3 turns)', () => {
    const b = resolveBehavior({ name: 'Quinotaur' });
    expect(archetypeOf({ name: 'Quinotaur' })).toBe('default');
    const miss = b.abilities.find((a) => a.id === 'missChance');
    expect(miss).toBeDefined();
    expect(miss!.label).toBe('Spit');
    expect(miss!.chance).toBe(0.01);
    expect(miss!.magnitude).toBe(0.25);
    expect(miss!.duration).toBe(3);
  });

  it('Dragon resolves with a Smoke Show miss chance (1% / 0.5 / 3t) on top of its Molten Breath DoT', () => {
    const b = resolveBehavior({ name: 'Dragon' });
    expect(archetypeOf({ name: 'Dragon' })).toBe('guardian');
    const miss = b.abilities.find((a) => a.id === 'missChance');
    expect(miss).toBeDefined();
    expect(miss!.label).toBe('Smoke Show');
    expect(miss!.magnitude).toBe(0.5);
    // It keeps its Molten Breath fire DoT too.
    expect(b.abilities.find((a) => a.id === 'poison')).toBeDefined();
  });

  it('inflicts a miss chance on a passing hit, exposes its magnitude, then ticks away', () => {
    // Isolate the Spit miss-chance (Quinotaur also has a Horn Twist bonus-damage
    // hit that would otherwise subtract HP under chance=1) to assert its no-HP-cost.
    const spit = resolveBehavior({ name: 'Quinotaur' }).abilities.find((a) => a.id === 'missChance')!;
    const b = { abilities: [spit] } as unknown as ReturnType<typeof resolveBehavior>;
    const m = monster('Quinotaur');
    const p = player({ hp: 20 });

    const logs = applyOnHitAbilities(b, m, p, chanceRng(true));
    expect(hasEffect(p, 'missChance')).toBe(true);
    expect(effectMagnitude(p, 'missChance')).toBe(0.25);
    expect(logs.join(' ')).toMatch(/Quinotaur blinds you/);
    expect(p.hp).toBe(20);

    tickPlayerEffects(p);
    tickPlayerEffects(p);
    tickPlayerEffects(p);
    expect(hasEffect(p, 'missChance')).toBe(false);
  });

  it('does not afflict (or touch the player) on a failed roll (parity)', () => {
    const b = resolveBehavior({ name: 'Quinotaur' });
    const m = monster('Quinotaur');
    const p = player({ hp: 20 });

    const logs = applyOnHitAbilities(b, m, p, chanceRng(false));
    expect(hasEffect(p, 'missChance')).toBe(false);
    expect(p.activeEffects).toHaveLength(0);
    expect(logs).toHaveLength(0);
  });

  it('does not leak the miss chance to siblings sharing an archetype', () => {
    // Quinotaur is default — must not leak to a plain default monster (Orc).
    expect(resolveBehavior({ name: 'Orc' }).abilities.find((a) => a.id === 'missChance')).toBeUndefined();
    // Dragon shares 'guardian' with Golem/Gary — they must NOT inherit Smoke Show.
    expect(resolveBehavior({ name: 'Gary the Golem' }).abilities.find((a) => a.id === 'missChance')).toBeUndefined();
  });
});
