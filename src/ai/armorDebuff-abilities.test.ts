import { describe, it, expect } from 'vitest';
import type { RNG } from '../rng';
import type { Monster, Player } from '../types';
import { resolveBehavior, archetypeOf } from './archetypes';
import { applyOnHitAbilities } from '../monster';
import { hasEffect, effectMagnitude, tickPlayerEffects } from '../effects';

/**
 * The armorDebuff ability: a NEW effect kind whose read site reduces the
 * player's total defense (Pygmy "Shrink", Pantier Pygmy King "Miniaturize").
 * Assigned per-monster in MONSTER_ABILITIES so siblings sharing an archetype are
 * unaffected. Values verbatim from the sheet (3% on hit).
 *
 * Mirrors stun-abilities.test.ts: force the proc and assert the effect applied +
 * ticks/expires; a no-proc case asserts the player is untouched (parity). The
 * engine-level proof that getTotalDef honors it lives in engine.test.ts.
 */

function monster(name: string, over: Partial<Monster> = {}): Monster {
  return {
    x: 0,
    y: 0,
    symbol: 'P',
    name,
    hp: 100,
    maxHp: 100,
    atk: 22,
    color: '#fff',
    minFloor: 8,
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

describe('armorDebuff abilities (Pygmy / Pantier Pygmy King)', () => {
  it('Pygmy resolves with a Shrink armor debuff (3% / -3 / 3 turns)', () => {
    const b = resolveBehavior({ name: 'Pygmy' });
    expect(archetypeOf({ name: 'Pygmy' })).toBe('default');
    const deb = b.abilities.find((a) => a.id === 'armorDebuff');
    expect(deb).toBeDefined();
    expect(deb!.label).toBe('Shrink');
    expect(deb!.chance).toBe(0.03);
    expect(deb!.magnitude).toBe(3);
    expect(deb!.duration).toBe(3);
  });

  it('Pantier Pygmy King resolves with a large Miniaturize debuff (3% / 99 / 2 turns)', () => {
    const b = resolveBehavior({ name: 'Pantier Pygmy King' });
    const deb = b.abilities.find((a) => a.id === 'armorDebuff');
    expect(deb).toBeDefined();
    expect(deb!.label).toBe('Miniaturize');
    expect(deb!.magnitude).toBe(99);
    expect(deb!.duration).toBe(2);
  });

  it('inflicts an armor debuff on a passing hit, exposes its magnitude, then ticks away', () => {
    const b = resolveBehavior({ name: 'Pygmy' });
    const m = monster('Pygmy');
    const p = player({ hp: 20 });

    const logs = applyOnHitAbilities(b, m, p, chanceRng(true));
    expect(hasEffect(p, 'armorDebuff')).toBe(true);
    expect(effectMagnitude(p, 'armorDebuff')).toBe(3);
    expect(logs.join(' ')).toMatch(/Pygmy weakens your armor/);
    expect(p.hp).toBe(20);

    tickPlayerEffects(p);
    tickPlayerEffects(p);
    tickPlayerEffects(p);
    expect(hasEffect(p, 'armorDebuff')).toBe(false);
  });

  it('does not debuff (or touch the player) on a failed roll (parity)', () => {
    const b = resolveBehavior({ name: 'Pygmy' });
    const m = monster('Pygmy');
    const p = player({ hp: 20 });

    const logs = applyOnHitAbilities(b, m, p, chanceRng(false));
    expect(hasEffect(p, 'armorDebuff')).toBe(false);
    expect(p.activeEffects).toHaveLength(0);
    expect(logs).toHaveLength(0);
  });

  it('does not leak the debuff to siblings sharing the default archetype', () => {
    expect(resolveBehavior({ name: 'Orc' }).abilities.find((a) => a.id === 'armorDebuff')).toBeUndefined();
    expect(resolveBehavior({ name: 'Orc' }).abilities).toHaveLength(0);
  });
});
