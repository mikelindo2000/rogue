import { describe, it, expect } from 'vitest';
import type { RNG } from '../rng';
import type { Monster, Player } from '../types';
import { resolveBehavior } from './archetypes';
import { applyOnHitAbilities } from '../monster';
import { describeAbility } from './abilityDescriptions';

/**
 * bonusDamage: flat extra damage dealt to the player when an ability procs,
 * applied generically by applyOnHitAbilities (on top of any status effect). A
 * pure-damage ability uses id 'bonusDamage'; a mixed one (stun + extra hit)
 * carries the rider on its effect id.
 */

function monster(name: string, over: Partial<Monster> = {}): Monster {
  return { x: 0, y: 0, symbol: 'O', name, hp: 50, maxHp: 50, atk: 7, color: '#fff', minFloor: 1, frozenTurns: 0, ...over };
}
function player(over: Partial<Player> = {}): Player {
  return { hp: 50, maxHp: 50, gold: 0, activeEffects: [], ...over } as unknown as Player;
}
function chanceRng(fire: boolean): RNG {
  return { seed: 0, next: () => 0, int: () => 0, range: (min: number) => min, chance: () => fire, pick: <T>(a: readonly T[]) => a[0], getState: () => 0 } as unknown as RNG;
}

describe('bonusDamage abilities', () => {
  it('Orc resolves with Hammer Smash (+2, 3%) — its only ability', () => {
    const b = resolveBehavior({ name: 'Orc' });
    const hs = b.abilities.find((a) => a.id === 'bonusDamage');
    expect(hs).toMatchObject({ label: 'Hammer Smash', chance: 0.03, bonusDamage: 2 });
    expect(b.abilities).toHaveLength(1);
  });

  it('a proc deals the flat extra damage and logs the ability name', () => {
    const b = resolveBehavior({ name: 'Orc' });
    const p = player({ hp: 50 });
    const logs = applyOnHitAbilities(b, monster('Orc'), p, chanceRng(true));
    expect(p.hp).toBe(48); // -2 from Hammer Smash
    expect(logs.join(' ')).toMatch(/Orc's Hammer Smash strikes for 2/);
  });

  it('does not deal damage when the chance roll fails (parity)', () => {
    const b = resolveBehavior({ name: 'Orc' });
    const p = player({ hp: 50 });
    const logs = applyOnHitAbilities(b, monster('Orc'), p, chanceRng(false));
    expect(p.hp).toBe(50);
    expect(logs).toHaveLength(0);
  });

  it('a mixed ability applies BOTH its status effect and the bonus-damage rider', () => {
    // Yeti Freeze Frame: a stun that also deals +5. Force only the 2nd ability by
    // resolving Yeti and firing the stun row directly is awkward through the proc
    // loop (both would proc with chance=1), so assert the combined HP loss + a stun.
    const b = resolveBehavior({ name: 'Yeti' });
    const p = player({ hp: 50 });
    applyOnHitAbilities(b, monster('Yeti'), p, chanceRng(true));
    // Ice Spear (+6) and Freeze Frame (+5) both proc under chance=1 → 11 damage,
    // and Freeze Frame leaves a stun.
    expect(p.hp).toBe(50 - 6 - 5);
    expect(p.activeEffects.some((e) => e.kind === 'stun')).toBe(true);
  });

  it('describeAbility renders pure and mixed bonus damage', () => {
    expect(describeAbility({ id: 'bonusDamage', label: 'Hammer Smash', chance: 0.03, bonusDamage: 2, cooldown: 0, trigger: 'onHit' }).effect)
      .toBe('2 extra damage');
    expect(describeAbility({ id: 'stun', label: 'Freeze Frame', chance: 0.01, duration: 1, bonusDamage: 5, cooldown: 0, trigger: 'onHit' }).effect)
      .toBe('you lose 1 turn, plus 5 extra damage');
  });

  it('does not leak bonusDamage to siblings (Colossal Cyclops has no Hammer Smash)', () => {
    expect(resolveBehavior({ name: 'Colossal Cyclops' }).abilities.find((a) => a.label === 'Hammer Smash')).toBeUndefined();
  });

  it('fires onProc with the ability on a proc (for the map float), but not on a miss', () => {
    const b = resolveBehavior({ name: 'Orc' });
    const procced: string[] = [];
    const onProc = (ab: { label?: string }) => procced.push(ab.label ?? '?');

    applyOnHitAbilities(b, monster('Orc'), player(), chanceRng(true), 1, onProc);
    expect(procced).toEqual(['Hammer Smash']);

    procced.length = 0;
    applyOnHitAbilities(b, monster('Orc'), player(), chanceRng(false), 1, onProc);
    expect(procced).toEqual([]);
  });
});
