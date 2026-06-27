import { describe, it, expect } from 'vitest';
import type { RNG } from '../rng';
import type { Monster, Player } from '../types';
import { resolveBehavior, archetypeOf } from './archetypes';
import { applyOnHitAbilities } from '../monster';
import { hasEffect, tickPlayerEffects } from '../effects';

/**
 * The silenceMagic ability: a NEW effect kind whose read site blocks wand zaps
 * (Zombie "Putrid Bite"). Assigned per-monster in MONSTER_ABILITIES, merged on
 * top of the leech archetype so the Zombie keeps its leech heal too. Values
 * verbatim from the sheet (3% on hit).
 *
 * Mirrors stun-abilities.test.ts. The engine-level proof that zapWand is blocked
 * lives in engine.test.ts.
 */

function monster(name: string, over: Partial<Monster> = {}): Monster {
  return {
    x: 0,
    y: 0,
    symbol: 'Z',
    name,
    hp: 100,
    maxHp: 100,
    atk: 89,
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

describe('silenceMagic abilities (Zombie)', () => {
  it('Zombie resolves with a Putrid Bite silence (3% / 3t) on top of its leech heal', () => {
    const b = resolveBehavior({ name: 'Zombie' });
    expect(archetypeOf({ name: 'Zombie' })).toBe('leech');
    const sil = b.abilities.find((a) => a.id === 'silenceMagic');
    expect(sil).toBeDefined();
    expect(sil!.label).toBe('Putrid Bite');
    expect(sil!.chance).toBe(0.03);
    expect(sil!.duration).toBe(3);
    // It keeps the leech-archetype heal too — abilities merge additively.
    expect(b.abilities.find((a) => a.id === 'leechHeal')).toBeDefined();
  });

  it('inflicts silence on a passing hit, then ticks away', () => {
    const b = resolveBehavior({ name: 'Zombie' });
    const m = monster('Zombie');
    // Full HP so the leech heal is a no-op and only the silence proc logs/matters.
    const p = player({ hp: 20 });

    const logs = applyOnHitAbilities(b, m, p, chanceRng(true));
    expect(hasEffect(p, 'silenceMagic')).toBe(true);
    expect(p.activeEffects[0]).toMatchObject({ kind: 'silenceMagic', turns: 3, source: 'Zombie' });
    expect(logs.join(' ')).toMatch(/Zombie seals your magic/);

    tickPlayerEffects(p);
    tickPlayerEffects(p);
    tickPlayerEffects(p);
    expect(hasEffect(p, 'silenceMagic')).toBe(false);
  });

  it('does not silence the player on a failed roll (parity)', () => {
    const b = resolveBehavior({ name: 'Zombie' });
    const m = monster('Zombie');
    const p = player({ hp: 20 });

    applyOnHitAbilities(b, m, p, chanceRng(false));
    expect(hasEffect(p, 'silenceMagic')).toBe(false);
    expect(p.activeEffects).toHaveLength(0);
  });

  it('does not leak the silence to siblings sharing the leech archetype', () => {
    // Zachary shares 'leech' with Zombie but has its own sheet abilities — it must
    // NOT inherit Putrid Bite.
    expect(resolveBehavior({ name: 'Zachary the Zombie' }).abilities.find((a) => a.id === 'silenceMagic')).toBeUndefined();
  });
});
